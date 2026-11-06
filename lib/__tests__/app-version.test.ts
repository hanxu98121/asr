import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveVersion } from '../app-version';

type Responses = Record<string, string | Error>;

// Maps a git command to canned output; an Error value makes that command throw.
function fakeGit(responses: Responses) {
  return (args: string) => {
    const response = responses[args];
    if (response === undefined) throw new Error(`unexpected git ${args}`);
    if (response instanceof Error) throw response;
    return response;
  };
}

const DESCRIBE = 'describe --tags --match "v[0-9]*" --abbrev=0';
const SHA = 'c060e5a1111111111111111111111111111111111';

test('without a tag every commit counts and package.json supplies major.minor', () => {
  const git = fakeGit({
    [DESCRIBE]: new Error('no tags'), 'rev-list --count HEAD': '43',
    'rev-parse HEAD': SHA, 'status --porcelain': '',
  });
  assert.equal(resolveVersion(git, '0.1.0', {}), 'v0.1.43 (c060e5a)');
});

test('the newest tag sets major.minor and the patch counts commits since it', () => {
  const git = fakeGit({
    [DESCRIBE]: 'v0.2', 'rev-list --count v0.2..HEAD': '1',
    'rev-parse HEAD': SHA, 'status --porcelain': '',
  });
  assert.equal(resolveVersion(git, '0.1.0', {}), 'v0.2.1 (c060e5a)');
});

test('the tagged commit itself is patch 0', () => {
  const git = fakeGit({
    [DESCRIBE]: 'v0.2', 'rev-list --count v0.2..HEAD': '0',
    'rev-parse HEAD': SHA, 'status --porcelain': '',
  });
  assert.equal(resolveVersion(git, '0.1.0', {}), 'v0.2.0 (c060e5a)');
});

test('a three-part tag still contributes only major.minor', () => {
  const git = fakeGit({
    [DESCRIBE]: 'v1.4.7', 'rev-list --count v1.4.7..HEAD': '5',
    'rev-parse HEAD': SHA, 'status --porcelain': '',
  });
  assert.equal(resolveVersion(git, '0.1.0', {}), 'v1.4.5 (c060e5a)');
});

test('a tag that is not a version is ignored instead of reaching the shell', () => {
  const git = fakeGit({
    [DESCRIBE]: 'v1; rm -rf', 'rev-list --count HEAD': '10',
    'rev-parse HEAD': SHA, 'status --porcelain': '',
  });
  assert.equal(resolveVersion(git, '0.3.0', {}), 'v0.3.10 (c060e5a)');
});

test('local uncommitted changes add -dirty, but CI builds never do', () => {
  const responses = {
    [DESCRIBE]: new Error('no tags'), 'rev-list --count HEAD': '43',
    'rev-parse HEAD': SHA, 'status --porcelain': ' M app/page.tsx',
  };
  assert.equal(resolveVersion(fakeGit(responses), '0.1.0', {}), 'v0.1.43 (c060e5a-dirty)');
  assert.equal(resolveVersion(fakeGit(responses), '0.1.0', { CI: 'true' }), 'v0.1.43 (c060e5a)');
});

test('a commit sha from the environment wins over rev-parse', () => {
  const git = fakeGit({
    [DESCRIBE]: new Error('no tags'), 'rev-list --count HEAD': '43', 'status --porcelain': '',
  });
  assert.equal(resolveVersion(git, '0.1.0', { GITHUB_SHA: 'abcdef1234567' }), 'v0.1.43 (abcdef1)');
});

test('falls back to the package version when git is unavailable', () => {
  const git = () => { throw new Error('git missing'); };
  assert.equal(resolveVersion(git, '0.1.0', {}), 'v0.1.0 (build unknown)');
});
