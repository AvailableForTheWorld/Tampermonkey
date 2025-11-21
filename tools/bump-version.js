const fs = require('fs')
const path = require('path')
const semver = require('semver')
const minimist = require('minimist')

const args = minimist(process.argv.slice(2))
let scriptName = args._[0]
let bumpType = args._[1] // major, minor, patch

const scriptsDir = path.join(__dirname, '../scripts')

async function main() {
  // Dynamic import for inquirer (since v9+ is ESM-only)
  const { default: inquirer } = await import('inquirer')

  if (!fs.existsSync(scriptsDir)) {
    console.error('Error: scripts directory not found.')
    process.exit(1)
  }

  const scripts = fs
    .readdirSync(scriptsDir)
    .filter((f) => fs.statSync(path.join(scriptsDir, f)).isDirectory())

  if (scripts.length === 0) {
    console.error('No scripts found in scripts directory.')
    process.exit(1)
  }

  if (!scriptName) {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'script',
        message: 'Select a script to bump:',
        choices: scripts,
      },
    ])
    scriptName = answer.script
  }

  if (!bumpType) {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'type',
        message: 'Select release type:',
        choices: [
          { name: 'Patch (0.0.1 -> 0.0.2)', value: 'patch' },
          { name: 'Minor (0.1.0 -> 0.2.0)', value: 'minor' },
          { name: 'Major (1.0.0 -> 2.0.0)', value: 'major' },
        ],
      },
    ])
    bumpType = answer.type
  }

  const scriptFile = path.join(scriptsDir, scriptName, 'index.user.js')

  if (!fs.existsSync(scriptFile)) {
    console.error(`Error: Script file not found at ${scriptFile}`)
    process.exit(1)
  }

  const content = fs.readFileSync(scriptFile, 'utf8')
  const versionMatch = content.match(/\/\/ @version\s+([\d\.]+)/)

  if (!versionMatch) {
    console.error('Error: Could not find @version in script file')
    process.exit(1)
  }

  const currentVersion = versionMatch[1]
  const releaseType =
    bumpType && ['major', 'minor', 'patch'].includes(bumpType)
      ? bumpType
      : 'patch'

  const newVersion = semver.inc(currentVersion, releaseType)

  if (!newVersion) {
    console.error(
      `Error: Invalid version bump type "${bumpType}". Use major, minor, or patch.`
    )
    process.exit(1)
  }

  // Preserve exact whitespace if possible, but standardizing to match the regex replacement
  const newContent = content.replace(
    versionMatch[0],
    `// @version      ${newVersion}`
  )
  fs.writeFileSync(scriptFile, newContent)

  console.log(
    `\n✅  Successfully updated ${scriptName}\n    ${currentVersion}  ->  ${newVersion}\n`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
