'use strict';

Error.stackTraceLimit = Infinity;

const acquit = require('acquit');
const fs = require('fs');
const path = require('path');
const pug = require('pug');
const pkg = require('../package.json');
const transform = require('acquit-require');
const childProcess = require("child_process");

// using "__dirname" and ".." to have a consistent CWD, this script should not be runnable, even when not being in the root of the project
// also a consistent root path so that it is easy to change later when the script should be moved
const cwd = path.resolve(__dirname, '..');

const isMain = require.main === module;

let jobs = [];
try {
  jobs = require('../docs/data/jobs.json');
} catch (err) {}

let opencollectiveSponsors = [];
try {
  opencollectiveSponsors = require('../docs/data/opencollective.json');
} catch (err) {}

require('acquit-ignore')();

const { marked: markdown } = require('marked');
const highlight = require('highlight.js');
const { promisify } = require("util");
const renderer = {
  heading: function(text, level, raw, slugger) {
    const slug = slugger.slug(raw);
    return `<h${level} id="${slug}">
      <a href="#${slug}">
        ${text}
      </a>
    </h${level}>\n`;
  }
};
markdown.setOptions({
  highlight: function(code, language) {
    if (!language) {
      language = 'javascript';
    }
    if (language === 'no-highlight') {
      return code;
    }
    return highlight.highlight(code, { language }).value;
  }
});
markdown.use({ renderer });

const testPath = path.resolve(cwd, 'test')

const tests = [
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'geojson.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/transactions.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'schema.alias.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'model.middleware.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/date.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/lean.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/cast.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/findoneandupdate.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/custom-casting.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/getters-setters.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/virtuals.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/defaults.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/discriminators.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/promises.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/schematypes.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/validation.test.js')).toString()),
  ...acquit.parse(fs.readFileSync(path.join(testPath, 'docs/schemas.test.js')).toString())
];

/** 
 * Array of array of semver numbers, sorted with highest number first
 * @example
 * [[1,2,3], [0,1,2]]
 * @type {number[][]} 
 */
let filteredTags = [];

/**
 * Parse a given semver version string to a number array
 * @param {string} str The string to parse
 * @returns number array or undefined
 */
function parseVersion(str) {
  const versionReg = /^v?(\d+)\.(\d+)\.(\d+)$/i;

  const match = versionReg.exec(str);

  if (!!match) {
    const parsed = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]

    // fallback just in case some number did not parse
    if (Number.isNaN(parsed[0]) || Number.isNaN(parsed[1]) || Number.isNaN(parsed[2])) {
      console.log(`some version was matched but did not parse to int! "${str}"`);
      return undefined;
    }
    return parsed;
  }

  return undefined;
}

function getVersions() {
  // get all tags from git
  const res = childProcess.execSync("git tag").toString();

  filteredTags = res.split('\n')
  // map all gotten tags if they match the regular expression
  .map(parseVersion)
  // filter out all null / undefined / falsy values
  .filter(v => !!v)
  // sort tags with latest (highest) first
  .sort((a, b) => {
    if (a[0] === b[0]) {
      if (a[1] === b[1]) {
        return b[2] - a[2];
      }
      return b[1] - a[1];
    }
    return b[0] - a[0];
  });
}

/**
 * Stringify a semver number array
 * @param {number[]} arr The array to stringify
 * @param {boolean} dotX If "true", return "5.X" instead of "5.5.5"
 * @returns 
 */
function stringifySemverNumber(arr, dotX) {
  if (dotX) {
    return `${arr[0]}.x`;  
  }
  return `${arr[0]}.${arr[1]}.${arr[2]}`;
}

/** 
 * Get the latest version available
 * @returns {Version}
 */
function getLatestVersion() {
  return { listed: stringifySemverNumber(filteredTags[0]), path: '' };
}

/**
 * Get the latest version for the provided major version
 * @param {number} version major version to search for
 * @returns {Version}
 */
function getLatestVersionOf(version) {
  let foundVersion = filteredTags.find(v => v[0] === version);

  // fallback to "0" in case a version cannot be found
  if (!foundVersion) {
    console.error(`Could not find a version for major "${version}"`);
    foundVersion = [0, 0, 0];
  }

  return {listed: stringifySemverNumber(foundVersion), path: stringifySemverNumber(foundVersion, true)};
}

/**
 * Try to get the current version on the checked-out branch
 * @returns {Version}
 */
function getCurrentVersion() {
  let versionToUse = pkg.version;

  // i dont think this will ever happen, but just in case
  if (!pkg.version) {
    console.log("no version from package?");
    versionToUse = getLatestVersion();
  }

  return {listed: versionToUse, path: '' };
}

// execute function to get all tags from git
getVersions();

/**
 * @typedef {Object} Version
 * @property {string} listed The string it is displayed as
 * @property {string} path The path to use for the actual url
 */

/**
 * Object for all version information
 * @property {Version} currentVersion The current version this branch is built for
 * @property {string} latestVersion The latest version available across the repository
 * @property {Version[]} pastVersions The latest versions of past major versions to include as selectable
 * @property {boolean} versionedDeploy Indicates wheter to build for a version or as latest (no prefix)
 * @property {string} versionedPath The path to use for versioned deploy (empty string when "versionedDeploy" is false)
 */
const versionObj = (() => {
  const base = {
    currentVersion: getCurrentVersion(),
    latestVersion: getLatestVersion(),
    pastVersions: [
      getLatestVersionOf(6),
      getLatestVersionOf(5),
    ]
  };
  const versionedDeploy = process.env.DOCS_DEPLOY === "true" ? base.currentVersion === base.latestVersion : false;

  const versionedPath = versionedDeploy ? `/docs/${stringifySemverNumber(parseVersion(base.currentVersion), true)}` : '';

  return {
    ...base,
    versionedDeploy,
    versionedPath
  };
})();

// Create api dir if it doesn't already exist
try {
  fs.mkdirSync(path.join(cwd, './docs/api'));
} catch (err) {} // eslint-disable-line no-empty

const docsFilemap = require('../docs/source/index');
const files = Object.keys(docsFilemap.fileMap);

const wrapMarkdown = (md, baseLayout) => `
extends ${baseLayout}

append style
  link(rel="stylesheet", href="#{versions.versionedPath}/docs/css/inlinecpc.css")
  script(type="text/javascript" src="#{versions.versionedPath}/docs/js/native.js")
  style.
    p { line-height: 1.5em }

block content
  <a class="edit-docs-link" href="#{editLink}" target="_blank">
    <img src="#{versions.versionedPath}/docs/images/pencil.svg" />
  </a>
  :markdown
${md.split('\n').map(line => '    ' + line).join('\n')}
`;

const cpc = `
<script>
  _native.init("CK7DT53U",{
    targetClass: 'native-inline'
  });
</script>

<div class="native-inline">
  <a href="#native_link#"><span class="sponsor">Sponsor</span> #native_company# — #native_desc#</a>
</div>
`;

/** Alias to not execute "promisify" often */
const pugRender = promisify(pug.render);

async function pugify(filename, options) {
  let newfile = undefined;
  options = options || {};
  options.package = pkg;

  const _editLink = 'https://github.com/Automattic/mongoose/blob/master' +
    filename.replace(cwd, '');
  options.editLink = options.editLink || _editLink;

  /** Set which path to read, also pug uses this to resolve relative includes from */
  let inputFile = filename;

  if (options.api) {
    inputFile = path.resolve(cwd, 'docs/api_split.pug');
  }

  let contents = fs.readFileSync(path.resolve(cwd, inputFile)).toString();

  if (options.acquit) {
    contents = transform(contents, tests);

    contents = contents.replaceAll(/^```acquit$/gmi, "```javascript");
  }
  if (options.markdown) {
    const lines = contents.split('\n');
    lines.splice(2, 0, cpc);
    contents = lines.join('\n');
    contents = wrapMarkdown(contents, path.relative(path.dirname(filename), path.join(cwd, 'docs/layout')));
    newfile = filename.replace('.md', '.html');
  }

  options.filename = inputFile;
  options.filters = {
    markdown: function(block) {
      return markdown.parse(block);
    }
  };

  if (options.api) {
    newfile = path.resolve(cwd, filename);
    options.docs = docsFilemap.apiDocs;
  }

  newfile = newfile || filename.replace('.pug', '.html');
  options.outputUrl = newfile.replace(cwd, '');
  options.jobs = jobs;
  options.versions = versionObj;

  options.opencollectiveSponsors = opencollectiveSponsors;

  const str = await pugRender(contents, options).catch(console.error);

  if (typeof str !== "string") {
    return;
  }
  
  await fs.promises.writeFile(newfile, str).catch((err) => {
    console.error('could not write', err.stack);
  }).then(() => {
    console.log('%s : rendered ', new Date(), newfile);
  });
}

// extra function to start watching for file-changes, without having to call this file directly with "watch"
function startWatch() {
  Object.entries(docsFilemap.fileMap).forEach(([file, fileValue]) => {
    let watchPath = path.resolve(cwd, file);
    const notifyPath = path.resolve(cwd, file);

    if (fileValue.api) {
      watchPath = path.resolve(cwd, fileValue.file);
    }

    fs.watchFile(watchPath, { interval: 1000 }, (cur, prev) => {
      if (cur.mtime > prev.mtime) {
        pugify(notifyPath, docsFilemap.fileMap[file]);
      }
    });
  });

  fs.watchFile(path.join(cwd, 'docs/layout.pug'), { interval: 1000 }, (cur, prev) => {
    if (cur.mtime > prev.mtime) {
      console.log('docs/layout.pug modified, reloading all files');
      pugifyAllFiles(true);
    }
  });

  fs.watchFile(path.join(cwd, 'docs/api_split.pug'), {interval: 1000}, (cur, prev) => {
    if (cur.mtime > prev.mtime) {
      console.log('docs/api_split.pug modified, reloading all api files');
      Promise.all(files.filter(v=> v.startsWith('docs/api')).map(async (file) => {
        const filename = path.join(cwd, file);
        await pugify(filename, docsFilemap.fileMap[file]);
      }));
    }
  });
}

async function pugifyAllFiles(noWatch) {
  await Promise.all(files.map(async (file) => {
    const filename = path.join(cwd, file);
    await pugify(filename, docsFilemap.fileMap[file]);
  }));

  // enable watch after all files have been done once, and not in the loop to use less-code
  // only enable watch if main module AND having argument "--watch"
  if (!noWatch && isMain && process.argv[2] === '--watch') {
    startWatch();
  }
}

exports.default = pugify;
exports.pugify = pugify;
exports.startWatch = startWatch;
exports.pugifyAllFiles = pugifyAllFiles;
exports.cwd = cwd;

// only run the following code if this file is the main module / entry file
if (isMain) {
  console.log(`Processing ~${files.length} files`);
  pugifyAllFiles();
}
