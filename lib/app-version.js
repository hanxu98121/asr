// Plain CommonJS because next.config.js loads it before any TypeScript is compiled.
const VERSION_TAG = /^v(\d+)\.(\d+)(?:\.\d+)?$/;

/**
 * The version is `v<major.minor>.<patch>`. Major.minor comes from the newest `v<major>.<minor>`
 * tag (run `git tag v0.2` to start a new line); the patch counts commits since that tag.
 * Without a tag, major.minor comes from package.json and every commit counts.
 *
 * @param {(args: string) => string} git runs a git command and returns trimmed stdout, or throws
 * @param {string} pkgVersion version from package.json
 * @param {Record<string, string | undefined>} env process.env
 */
function resolveVersion(git, pkgVersion, env = {}) {
  try {
    let line = pkgVersion.split('.').slice(0, 2).join('.');
    let range = 'HEAD';
    try {
      const tag = git('describe --tags --match "v[0-9]*" --abbrev=0');
      const match = VERSION_TAG.exec(tag);
      if (match) {
        line = `${match[1]}.${match[2]}`;
        range = `${tag}..HEAD`;
      }
    } catch { /* No tag is reachable yet. */ }
    const patch = git(`rev-list --count ${range}`);
    const sha = (env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || git('rev-parse HEAD')).slice(0, 7);
    const dirty = !env.CI && git('status --porcelain') ? '-dirty' : '';
    return `v${line}.${patch} (${sha}${dirty})`;
  } catch {
    return `v${pkgVersion} (build unknown)`;
  }
}

module.exports = { resolveVersion };
