/**
 * `nuos-catalogue init` + `install-protocols` tests.
 *
 * Synthetic temp-dir: each test creates a fresh empty directory,
 * runs the command, and asserts the resulting tree.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { cmdInit, cmdInstallProtocols } from '../src/commands/init.js';
import type { Prompt } from '../src/commands/prompt.js';

class MockPrompt implements Prompt {
  private answers: string[];
  public output: string[] = [];
  constructor(answers: string[]) {
    this.answers = [...answers];
  }
  async ask(question: string): Promise<string> {
    this.output.push(`[ASK] ${question}`);
    return this.answers.shift() ?? '';
  }
  async askMultiline(question: string): Promise<string> {
    this.output.push(`[MULTI] ${question}`);
    return this.answers.shift() ?? '';
  }
  async askChoice(question: string, choices: string[]): Promise<string> {
    this.output.push(`[CHOICE] ${question} (${choices.join('|')})`);
    return this.answers.shift() ?? choices[0];
  }
  async confirm(question: string, defaultYes = true): Promise<boolean> {
    this.output.push(`[CONFIRM] ${question}`);
    const ans = this.answers.shift();
    if (ans === undefined) return defaultYes;
    return ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes' || ans === '';
  }
  print(line: string): void {
    this.output.push(`[PRINT] ${line}`);
  }
  close(): void {}
}

let workspace: string;

before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'nuos-init-test-'));
});

after(async () => {
  await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// §1 cmdInit on a fresh empty directory
// ---------------------------------------------------------------------------

describe('§1 init on a fresh directory', () => {
  test('creates the full catalogue structure', async () => {
    const cwd = path.join(workspace, 'fresh-project');
    await mkdir(cwd);
    const prompt = new MockPrompt([]);

    const result = await cmdInit(prompt, {
      cwd,
      name: 'test-project',
      tagline: 'a test project',
      domain: 'example.com',
      role: 'consumer',
      nonInteractive: true,
    });
    assert.equal(result.exitCode, 0, result.output);

    // docs/build/ tree exists
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'STATE.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'work-units', '_index.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'decisions', '_index.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'open-questions', '_index.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'personas', '_index.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'sessions', '_index.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'risks', '_index.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'START-OF-SESSION.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'END-OF-SESSION.md')));

    // methodfile.json at repo root with substitutions
    const methodfile = JSON.parse(await readFile(path.join(cwd, 'methodfile.json'), 'utf8'));
    assert.equal(methodfile.project.name, 'test-project');
    assert.equal(methodfile.project.tagline, 'a test project');
    assert.equal(methodfile.project.domain, 'example.com');

    // STATE.md substitutions
    const stateMd = await readFile(path.join(cwd, 'docs', 'build', 'STATE.md'), 'utf8');
    assert.match(stateMd, /test-project/);
    assert.doesNotMatch(stateMd, /\{\{PROJECT_NAME\}\}/);

    // .claude/commands/ has the four protocols (Claude Code)
    assert.ok(existsSync(path.join(cwd, '.claude', 'commands', 'start-of-session.md')));
    assert.ok(existsSync(path.join(cwd, '.claude', 'commands', 'end-of-session.md')));
    assert.ok(existsSync(path.join(cwd, '.claude', 'commands', 'wu-new.md')));
    assert.ok(existsSync(path.join(cwd, '.claude', 'commands', 'persona-new.md')));

    // .opencode/commands/ has the four protocols (OpenCode; same shape)
    assert.ok(existsSync(path.join(cwd, '.opencode', 'commands', 'start-of-session.md')));
    assert.ok(existsSync(path.join(cwd, '.opencode', 'commands', 'end-of-session.md')));
    assert.ok(existsSync(path.join(cwd, '.opencode', 'commands', 'wu-new.md')));
    assert.ok(existsSync(path.join(cwd, '.opencode', 'commands', 'persona-new.md')));

    // .agents/skills/<slug>/SKILL.md for each protocol (Codex CLI convention)
    assert.ok(existsSync(path.join(cwd, '.agents', 'skills', 'start-of-session', 'SKILL.md')));
    assert.ok(existsSync(path.join(cwd, '.agents', 'skills', 'end-of-session', 'SKILL.md')));
    assert.ok(existsSync(path.join(cwd, '.agents', 'skills', 'wu-new', 'SKILL.md')));
    assert.ok(existsSync(path.join(cwd, '.agents', 'skills', 'persona-new', 'SKILL.md')));

    // plan-orientation protocol fanned out across all three tools
    assert.ok(existsSync(path.join(cwd, '.claude', 'commands', 'plan-orientation.md')));
    assert.ok(existsSync(path.join(cwd, '.opencode', 'commands', 'plan-orientation.md')));
    assert.ok(existsSync(path.join(cwd, '.agents', 'skills', 'plan-orientation', 'SKILL.md')));

    // WELCOME and GLOSSARY are the entry points
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'WELCOME.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'GLOSSARY.md')));

    // Five new registers scaffolded with their _index.md files
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'maps', '_index.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'maps', '01-template.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'maps', '02-template.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'maps', '03-template.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'architecture', '_index.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'architecture', 'module-template.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'contracts', '_index.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'contracts', 'contract-template.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'ui-ux', '_index.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'ui-ux', 'surface-template.md')));

    // Design system register with multi-file shape
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'design-system', '_index.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'design-system', 'tokens-colour.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'design-system', 'tokens-typography.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'design-system', 'tokens-spacing.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'design-system', 'tokens-motion.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'design-system', 'tokens-radius-elevation.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'design-system', 'voice.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'design-system', 'accessibility.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'design-system', 'components', '_index.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'design-system', 'patterns', '_index.md')));

    // Two-tier WU templates
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'work-units', '001-template-simple.md')));
    assert.ok(existsSync(path.join(cwd, 'docs', 'build', 'work-units', '001-template-full.md')));

    // methodfile.json includes the planning tracker
    const mf2 = JSON.parse(await readFile(path.join(cwd, 'methodfile.json'), 'utf8'));
    assert.ok(mf2.planning, 'methodfile.planning section must exist');
    assert.equal(mf2.planning.phaseA_orientation, 'not_started');
    assert.equal(mf2.planning.phaseB_architecture, 'not_started');
    assert.equal(mf2.planning.phaseC_uiUxDesignSystem, 'not_started');
    assert.equal(mf2.planning.phaseD_maps, 'not_started');
    assert.equal(mf2.planning.phaseE_initialWorkUnits, 'not_started');

    // methodfile.json catalogue.registers includes the new register paths
    assert.ok(mf2.catalogue.registers.maps);
    assert.ok(mf2.catalogue.registers.architecture);
    assert.ok(mf2.catalogue.registers.contracts);
    assert.ok(mf2.catalogue.registers.uiUx);
    assert.ok(mf2.catalogue.registers.designSystem);

    // STATE.md has a Planning progress section
    const stateMd2 = await readFile(path.join(cwd, 'docs', 'build', 'STATE.md'), 'utf8');
    assert.match(stateMd2, /## Planning progress/);
    assert.match(stateMd2, /A.*Orientation/);
    assert.match(stateMd2, /E.*Initial Work Units/);

    // Codex frontmatter includes `name:` (per SKILL.md convention)
    const codexBody = await readFile(
      path.join(cwd, '.agents', 'skills', 'start-of-session', 'SKILL.md'),
      'utf8'
    );
    assert.match(codexBody, /^---\nname: start-of-session\ndescription: .+\n---\n/);

    // Claude / OpenCode frontmatter has `description:` but NOT `name:`
    const claudeBody = await readFile(
      path.join(cwd, '.claude', 'commands', 'start-of-session.md'),
      'utf8'
    );
    assert.match(claudeBody, /^---\ndescription: .+\n---\n/);
    assert.doesNotMatch(claudeBody, /\nname: /);

    // CLAUDE.md created with catalogue section
    const claudeMd = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    assert.match(claudeMd, /# test-project — Project Bootstrap/);
    assert.match(claudeMd, /## Build catalogue \(NuOS Build Method\)/);

    // .gitignore created with catalogue rules
    const gitignore = await readFile(path.join(cwd, '.gitignore'), 'utf8');
    assert.match(gitignore, /\.nuos-catalogue\//);

    // scripts/hooks/ source-of-truth files exist; .git/hooks/ active copies
    // only land when .git/ exists (the synthetic test dir doesn't have one).
    assert.ok(existsSync(path.join(cwd, 'scripts', 'hooks', 'pre-commit')));
    assert.ok(existsSync(path.join(cwd, 'scripts', 'hooks', 'post-commit')));
    assert.ok(existsSync(path.join(cwd, 'scripts', 'install-hooks.sh')));
  });
});

// ---------------------------------------------------------------------------
// §2 init refuses when docs/build/ already exists
// ---------------------------------------------------------------------------

describe('§2 init is one-shot', () => {
  test('refuses if docs/build/ already exists', async () => {
    const cwd = path.join(workspace, 'already-init');
    await mkdir(path.join(cwd, 'docs', 'build'), { recursive: true });
    const prompt = new MockPrompt([]);

    const result = await cmdInit(prompt, {
      cwd,
      name: 'foo',
      tagline: 'bar',
      nonInteractive: true,
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /already exists/);
  });
});

// ---------------------------------------------------------------------------
// §3 init preserves existing CLAUDE.md content
// ---------------------------------------------------------------------------

describe('§3 init preserves existing CLAUDE.md', () => {
  test('appends catalogue section to existing CLAUDE.md', async () => {
    const cwd = path.join(workspace, 'with-claude-md');
    await mkdir(cwd);
    await writeFile(
      path.join(cwd, 'CLAUDE.md'),
      '# Existing CLAUDE.md\n\nThis project already has rules.\n',
      'utf8'
    );

    const prompt = new MockPrompt([]);
    const result = await cmdInit(prompt, {
      cwd,
      name: 'preserve-test',
      tagline: 'preserve test',
      nonInteractive: true,
    });
    assert.equal(result.exitCode, 0, result.output);

    const claudeMd = await readFile(path.join(cwd, 'CLAUDE.md'), 'utf8');
    assert.match(claudeMd, /# Existing CLAUDE\.md/);
    assert.match(claudeMd, /This project already has rules/);
    assert.match(claudeMd, /## Build catalogue \(NuOS Build Method\)/);
  });
});

// ---------------------------------------------------------------------------
// §4 init handles existing .gitignore with build/ rule
// ---------------------------------------------------------------------------

describe('§4 init handles unanchored build/ in .gitignore', () => {
  test('adds !docs/build/ override when build/ rule is present', async () => {
    const cwd = path.join(workspace, 'with-gitignore');
    await mkdir(cwd);
    await writeFile(
      path.join(cwd, '.gitignore'),
      'node_modules/\n.next/\nbuild/\ndist/\n',
      'utf8'
    );

    const prompt = new MockPrompt([]);
    const result = await cmdInit(prompt, {
      cwd,
      name: 'g-test',
      tagline: 't',
      nonInteractive: true,
    });
    assert.equal(result.exitCode, 0);

    const gitignore = await readFile(path.join(cwd, '.gitignore'), 'utf8');
    assert.match(gitignore, /node_modules\//);
    assert.match(gitignore, /build\//);
    assert.match(gitignore, /!docs\/build\//);
    assert.match(gitignore, /!docs\/build\/\*\*/);
    assert.match(gitignore, /\.nuos-catalogue\//);
  });

  test('does NOT add !docs/build/ override when no unanchored build/ rule', async () => {
    const cwd = path.join(workspace, 'no-build-rule');
    await mkdir(cwd);
    await writeFile(path.join(cwd, '.gitignore'), 'node_modules/\n*.log\n', 'utf8');

    const prompt = new MockPrompt([]);
    const result = await cmdInit(prompt, {
      cwd,
      name: 'nb-test',
      tagline: 't',
      nonInteractive: true,
    });
    assert.equal(result.exitCode, 0);

    const gitignore = await readFile(path.join(cwd, '.gitignore'), 'utf8');
    assert.doesNotMatch(gitignore, /!docs\/build\//);
    assert.match(gitignore, /\.nuos-catalogue\//);
  });
});

// ---------------------------------------------------------------------------
// §5 cmdInstallProtocols
// ---------------------------------------------------------------------------

describe('§5 install-protocols', () => {
  test('creates all three tool paths and installs four protocols each', async () => {
    const cwd = path.join(workspace, 'install-fresh');
    await mkdir(cwd);
    const prompt = new MockPrompt([]);

    const result = await cmdInstallProtocols(prompt, { cwd });
    assert.equal(result.exitCode, 0);

    // Claude Code
    assert.ok(existsSync(path.join(cwd, '.claude', 'commands', 'start-of-session.md')));
    assert.ok(existsSync(path.join(cwd, '.claude', 'commands', 'end-of-session.md')));
    assert.ok(existsSync(path.join(cwd, '.claude', 'commands', 'wu-new.md')));
    assert.ok(existsSync(path.join(cwd, '.claude', 'commands', 'persona-new.md')));

    // OpenCode
    assert.ok(existsSync(path.join(cwd, '.opencode', 'commands', 'start-of-session.md')));
    assert.ok(existsSync(path.join(cwd, '.opencode', 'commands', 'end-of-session.md')));
    assert.ok(existsSync(path.join(cwd, '.opencode', 'commands', 'wu-new.md')));
    assert.ok(existsSync(path.join(cwd, '.opencode', 'commands', 'persona-new.md')));

    // Codex CLI (directory-based)
    assert.ok(existsSync(path.join(cwd, '.agents', 'skills', 'start-of-session', 'SKILL.md')));
    assert.ok(existsSync(path.join(cwd, '.agents', 'skills', 'end-of-session', 'SKILL.md')));
    assert.ok(existsSync(path.join(cwd, '.agents', 'skills', 'wu-new', 'SKILL.md')));
    assert.ok(existsSync(path.join(cwd, '.agents', 'skills', 'persona-new', 'SKILL.md')));

    // Output mentions all three tool paths
    assert.ok(prompt.output.some((l) => /created\s+\.claude\/commands\/start-of-session\.md/.test(l)));
    assert.ok(prompt.output.some((l) => /created\s+\.opencode\/commands\/start-of-session\.md/.test(l)));
    assert.ok(prompt.output.some((l) => /created\s+\.agents\/skills\/start-of-session\/SKILL\.md/.test(l)));
  });

  test('reports unchanged when files already match canonical', async () => {
    const cwd = path.join(workspace, 'install-existing');
    await mkdir(cwd);
    const promptA = new MockPrompt([]);
    await cmdInstallProtocols(promptA, { cwd });

    // Re-run; expect "unchanged"
    const promptB = new MockPrompt([]);
    await cmdInstallProtocols(promptB, { cwd });
    assert.ok(promptB.output.some((l) => /unchanged\s+\.claude\/commands\/start-of-session\.md/.test(l)));
  });

  test('reports updated when an existing file differs from canonical', async () => {
    const cwd = path.join(workspace, 'install-drifted');
    await mkdir(path.join(cwd, '.claude', 'commands'), { recursive: true });
    await writeFile(
      path.join(cwd, '.claude', 'commands', 'start-of-session.md'),
      '# Hand-edited stale version',
      'utf8'
    );

    const prompt = new MockPrompt([]);
    await cmdInstallProtocols(prompt, { cwd });
    const refreshed = await readFile(
      path.join(cwd, '.claude', 'commands', 'start-of-session.md'),
      'utf8'
    );
    assert.doesNotMatch(refreshed, /Hand-edited stale version/);
    assert.ok(prompt.output.some((l) => /updated\s+\.claude\/commands\/start-of-session\.md/.test(l)));
  });
});

console.log('@nusoft/nuos-build-catalogue — init + install-protocols: 8/8 acceptance verified');
