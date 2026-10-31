# Contributing to VaporBooster

Thank you for considering contributing! This document provides guidelines and instructions.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contribution Workflow](#contribution-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)

## Code of Conduct

This project adheres to a Code of Conduct. By participating, you agree to uphold it. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Getting Started

### Prerequisites

- Node.js 16+ installed
- Git installed
- Basic knowledge of JavaScript/Node.js
- Steam account for testing (use alt account!)

### Find an Issue

1. Check [Issues](https://github.com/stolenact/vaporbooster/issues)
2. Look for `good-first-issue` or `help-wanted` labels
3. Comment on the issue to claim it
4. Wait for maintainer approval before starting work

## Development Setup

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/stolenact/vaporbooster.git
cd vaporbooster

# 3. Add upstream remote
git remote add upstream https://github.com/original/vaporbooster.git

# 4. Install dependencies
npm install

# 5. Create a test config
cp config/accounts.example.json config/accounts.json
# Edit with your test account credentials

# 6. Run in development mode
npm run dev
```

## Contribution Workflow

### 1. Create a Branch

```bash
# Update your fork
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

### 2. Make Changes

- Write clear, concise code
- Follow existing code style
- Add comments for complex logic
- Update documentation if needed

### 3. Commit Changes

We use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: add invisible mode toggle"
git commit -m "fix: resolve login timeout issue"
git commit -m "docs: update README with new features"
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, etc.)
- `refactor`: Code refactor
- `test`: Adding tests
- `chore`: Maintenance tasks
- `perf`: Performance improvement
- `security`: Security fix

### 4. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Coding Standards

### JavaScript Style

We use ESLint and Prettier:

```bash
# Check linting
npm run lint

# Auto-fix issues
npm run lint:fix

# Format code
npm run format
```

### Code Guidelines

```javascript
// ✅ Good
async function loginAccount(account) {
    if (!account || !account.username) {
        throw new Error('Invalid account');
    }
    
    try {
        await client.logOn(account);
    } catch (err) {
        logger.error(`Login failed: ${err.message}`);
        throw err;
    }
}

// ❌ Bad
function login(acc) {
    client.logOn(acc.username, acc.password);
}
```

### Best Practices

- **Always validate inputs**
- **Handle errors gracefully**
- **Log important events**
- **Don't expose credentials**
- **Use async/await over callbacks**
- **Add JSDoc comments to functions**

```javascript
/**
 * Login to Steam account with rate limiting
 * @param {Object} account - Account configuration
 * @param {string} account.username - Steam username
 * @param {string} account.password - Steam password
 * @returns {Promise<void>}
 * @throws {Error} If login fails
 */
async function loginAccount(account) {
    // Implementation
}
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test -- login.test.js

# Watch mode
npm run test:watch
```

### Writing Tests

```javascript
// tests/login.test.js
const { loginAccount } = require('../src/accountHandler');

describe('Login', () => {
    it('should login with valid credentials', async () => {
        const account = {
            username: 'test',
            password: 'pass'
        };
        
        await expect(loginAccount(account)).resolves.not.toThrow();
    });
    
    it('should reject invalid credentials', async () => {
        const account = { username: '', password: '' };
        
        await expect(loginAccount(account)).rejects.toThrow();
    });
});
```

## Pull Request Process

### Before Submitting

- [ ] Code follows style guidelines
- [ ] Tests pass: `npm test`
- [ ] Lint passes: `npm run lint`
- [ ] Documentation updated
- [ ] Commits follow conventional format
- [ ] No merge conflicts with main
- [ ] PR description is clear

### PR Template

When creating a PR, include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How has this been tested?

## Checklist
- [ ] Tests pass
- [ ] Lint passes
- [ ] Documentation updated
- [ ] No breaking changes (or documented)

## Related Issues
Closes #123
```

### Review Process

1. Maintainer reviews code
2. CI/CD checks run automatically
3. Feedback is provided
4. Make requested changes
5. Once approved, maintainer merges

### After Merge

- Delete your branch
- Update your fork
- Celebrate! 🎉

## Release Process

### Versioning

We use [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

### Creating a Release

(Maintainers only)

```bash
# Update version
npm version major|minor|patch

# Push with tags
git push --follow-tags

# GitHub Actions creates release automatically
```

## Types of Contributions

### Bug Reports

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template:

- Describe the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment details
- Logs/screenshots

### Feature Requests

Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) template:

- Describe the feature
- Use cases
- Alternatives considered
- Mockups/examples

### Documentation

- Fix typos
- Improve clarity
- Add examples
- Translate (if applicable)

### Code

- Bug fixes
- New features
- Performance improvements
- Refactoring

## Questions?

- Check [Discussions](https://github.com/stolenact/vaporbooster/discussions)
- Join our [Discord](https://discord.gg/vaporbooster) (if available)
- Email: realzqpwi@gmail.com

---

**Thank you for contributing to VaporBooster!** 🚀