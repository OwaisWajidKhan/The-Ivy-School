// Builds the portable client release: copies the compiled exe + frontend into
// build/release/TheIvySchool, adds launchers + README, and zips it.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..', '..');
const build = path.join(root, 'backend', 'build');
const exe = path.join(build, 'TheIvySchool.exe');
const appSrc = path.join(root, 'frontend', 'dist');
const release = path.join(build, 'release', 'TheIvySchool');
const zipOut = path.join(build, 'TheIvySchool-Portable.zip');

const SEVEN_ZIP = 'C:\\Program Files\\7-Zip\\7z.exe';

function rm(dir) { fs.rmSync(dir, { recursive: true, force: true }); }
function copy(src, dst) { fs.cpSync(src, dst, { recursive: true, force: true }); }

console.log('Packaging portable release...');

if (!fs.existsSync(exe)) throw new Error('Compiled exe not found. Run "npm run bundle" first.');
if (!fs.existsSync(path.join(appSrc, 'index.html'))) throw new Error('Frontend build not found. Run "npm run build:frontend" first.');

rm(release);
rm(zipOut);
fs.mkdirSync(release, { recursive: true });

copy(exe, path.join(release, 'TheIvySchool.exe'));
copy(appSrc, path.join(release, 'app'));

fs.copyFileSync(path.join(__dirname, 'start.bat'), path.join(release, 'Start The Ivy School.bat'));
fs.copyFileSync(path.join(__dirname, 'stop.bat'), path.join(release, 'Stop The Ivy School.bat'));
fs.copyFileSync(path.join(__dirname, 'README.txt'), path.join(release, 'README.txt'));

if (!fs.existsSync(SEVEN_ZIP)) throw new Error(`7-Zip not found at ${SEVEN_ZIP}`);
execSync(`"${SEVEN_ZIP}" a -tzip -mx=9 "${zipOut}" "${release}\\*"`, { stdio: 'inherit' });

const mb = (fs.statSync(zipOut).size / 1024 / 1024).toFixed(1);
console.log(`Done. Release folder: ${release}`);
console.log(`Portable ZIP: ${zipOut} (${mb} MB) - send this to the client.`);
