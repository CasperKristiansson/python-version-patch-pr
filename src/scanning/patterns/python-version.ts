export interface VersionMatch {
  file: string;
  line: number;
  column: number;
  matched: string;
  major: number;
  minor: number;
  patch: number;
  index: number;
}

interface PatternDefinition {
  id: string;
  description: string;
  isFileSupported: (filePath: string) => boolean;
  regexes: RegExp[];
}

const VERSION_PATTERN = '\\d+\\.\\d+\\.\\d+';

export const pythonVersionPatterns: PatternDefinition[] = [
  {
    id: 'workflow-python-version',
    description: 'python-version inputs inside GitHub Actions workflows',
    isFileSupported: (filePath) => {
      const normalized = normalizePath(filePath).toLowerCase();
      const isWorkflowFile = normalized.includes('.github/workflows/');
      const isYaml = normalized.endsWith('.yml') || normalized.endsWith('.yaml');
      return isWorkflowFile && isYaml;
    },
    regexes: [
      new RegExp(String.raw`python-version\s*:\s*['"]?(?<version>${VERSION_PATTERN})['"]?`, 'gi'),
    ],
  },
  {
    id: 'dockerfile-from',
    description: 'Python base images in Dockerfiles',
    isFileSupported: isDockerfile,
    regexes: [
      new RegExp(`FROM\\s+[^\\s]*python[^\\s:]*:(?<version>${VERSION_PATTERN})`, 'gi'),
      new RegExp(
        String.raw`\b(?:ARG|ENV)\s+PYTHON[_-]?VERSION\s*=\s*['"]?(?<version>${VERSION_PATTERN})['"]?`,
        'gi',
      ),
    ],
  },
  {
    id: 'python-version-file',
    description: '.python-version files containing a sole version',
    isFileSupported: (filePath) => getBasename(filePath) === '.python-version',
    regexes: [new RegExp(`^\\s*(?<version>${VERSION_PATTERN})\\s*$`, 'gim')],
  },
  {
    id: 'tool-versions',
    description: 'python entries inside .tool-versions',
    isFileSupported: (filePath) => getBasename(filePath) === '.tool-versions',
    regexes: [new RegExp(`^python[^\\S\\r\\n]+(?<version>${VERSION_PATTERN})\\b`, 'gim')],
  },
  {
    id: 'runtime-txt',
    description: 'Heroku-style runtime.txt files',
    isFileSupported: (filePath) => getBasename(filePath) === 'runtime.txt',
    regexes: [new RegExp(`^python-(?<version>${VERSION_PATTERN})\\b`, 'gim')],
  },
  {
    id: 'pyproject-python',
    description: 'python/requirements entries inside pyproject.toml',
    isFileSupported: (filePath) => getBasename(filePath) === 'pyproject.toml',
    regexes: [
      new RegExp(
        `\\b(?:requires-python|python(?:[_-]?version)?|pythonVersion)\\s*=\\s*["](?:==)?(?<version>${VERSION_PATTERN})["]`,
        'gi',
      ),
    ],
  },
  {
    id: 'tox-ini',
    description: 'tox.ini basepython/python_version fields',
    isFileSupported: (filePath) => getBasename(filePath) === 'tox.ini',
    regexes: [
      new RegExp(`^\\s*python_version\\s*=\\s*(?<version>${VERSION_PATTERN})\\b`, 'gim'),
      new RegExp(`^\\s*basepython\\s*=\\s*python(?<version>${VERSION_PATTERN})\\b`, 'gim'),
    ],
  },
  {
    id: 'pipfile',
    description: 'Pipfile python version declarations',
    isFileSupported: (filePath) => getBasename(filePath) === 'pipfile',
    regexes: [
      new RegExp(`^\\s*python_full_version\\s*=\\s*["](?<version>${VERSION_PATTERN})["]`, 'gim'),
      new RegExp(`^\\s*python_version\\s*=\\s*["](?<version>${VERSION_PATTERN})["]`, 'gim'),
    ],
  },
  {
    id: 'environment-yml',
    description: 'Conda environment python dependencies',
    isFileSupported: (filePath) => {
      const base = getBasename(filePath);
      return base === 'environment.yml' || base === 'environment.yaml';
    },
    regexes: [new RegExp(`(?:^|\\s|-)python(?:==|=)(?<version>${VERSION_PATTERN})\\b`, 'gi')],
  },
];

function normalizePath(filePath: string): string {
  return filePath.replace(/\\\\/g, '/');
}

function getBasename(filePath: string): string {
  const normalized = normalizePath(filePath);
  const index = normalized.lastIndexOf('/');
  const base = index === -1 ? normalized : normalized.slice(index + 1);
  return base.toLowerCase();
}

function isDockerfile(filePath: string): boolean {
  const base = getBasename(filePath);
  return base === 'dockerfile' || base.endsWith('.dockerfile');
}

function cloneRegex(regex: RegExp): RegExp {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  return new RegExp(regex.source, flags);
}

function indexToPosition(content: string, index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;

  for (let i = 0; i < index; i += 1) {
    const char = content[i];
    if (char === '\n') {
      line += 1;
      column = 1;
      continue;
    }

    if (char === '\r') {
      if (content[i + 1] === '\n') {
        i += 1;
      }
      line += 1;
      column = 1;
      continue;
    }

    column += 1;
  }

  return { line, column };
}

function extractVersion(match: RegExpExecArray): string | null {
  if (match.groups && match.groups.version) {
    return match.groups.version;
  }

  return null;
}

export function findPythonVersionMatches(filePath: string, content: string): VersionMatch[] {
  const results: VersionMatch[] = [];

  for (const pattern of pythonVersionPatterns) {
    if (!pattern.isFileSupported(filePath)) {
      continue;
    }

    for (const regex of pattern.regexes) {
      const globalRegex = cloneRegex(regex);
      let match: RegExpExecArray | null;
      while ((match = globalRegex.exec(content)) !== null) {
        const version = extractVersion(match);
        if (!version) {
          continue;
        }

        const [major, minor, patch] = version.split('.').map(Number);
        if ([major, minor, patch].some((value) => Number.isNaN(value))) {
          continue;
        }

        const relativeIndex = match[0].indexOf(version);
        const versionIndex = match.index + (relativeIndex >= 0 ? relativeIndex : 0);
        const position = indexToPosition(content, versionIndex);

        results.push({
          file: filePath,
          line: position.line,
          column: position.column,
          matched: version,
          major,
          minor,
          patch,
          index: versionIndex,
        });
      }
    }
  }

  return results.sort((a, b) => {
    if (a.line !== b.line) {
      return a.line - b.line;
    }

    if (a.column !== b.column) {
      return a.column - b.column;
    }

    if (a.matched !== b.matched) {
      return a.matched.localeCompare(b.matched);
    }

    return 0;
  });
}
