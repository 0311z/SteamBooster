# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 3.x.x   | :white_check_mark: |
| 2.x.x   | :x:                |
| < 2.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

### 🔒 Private Disclosure

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please email us at: **realzqpwi@gmail.com** (or create a private security advisory)

### What to Include

Please include the following information:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)
- Your contact information

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity
  - Critical: 24-48 hours
  - High: 1 week
  - Medium: 2 weeks
  - Low: 1 month

### Security Measures

This project implements:
- ✅ Input validation and sanitization
- ✅ Encrypted credential storage (optional)
- ✅ Rate limiting
- ✅ Secure file permissions
- ✅ Dependency scanning
- ✅ No hardcoded secrets
- ✅ Prototype pollution protection

### Responsible Disclosure

We follow coordinated vulnerability disclosure:
1. You report the vulnerability privately
2. We acknowledge and investigate
3. We develop and test a fix
4. We release the fix
5. We publicly disclose (with credit to you if desired)

### Bug Bounty

Currently, we do not offer a bug bounty program. However, we will:
- Credit you in release notes (if you wish)

## Security Best Practices for Users

### Credential Protection
- Use strong, unique passwords
- Enable 2FA on Steam accounts
- Set restrictive file permissions: `chmod 600 config/accounts.json`
- Never commit `accounts.json` to version control

### Environment Security
- Run in isolated environment (container recommended)
- Keep Node.js and dependencies updated
- Use environment variables for sensitive data
- Enable encryption: `encryptCredentials: true` in settings

### Monitoring
- Review logs regularly
- Enable audit logging
- Monitor for unusual activity
- Set up alerts for repeated failures

## Known Security Considerations

### Steam ToS Violation
⚠️ **Using this software may violate Steam's Terms of Service**
- Use at your own risk
- Accounts may be suspended or banned
- We are not responsible for consequences

### Data Storage
- Credentials stored locally (encrypted when enabled)
- Session data cached in `accounts_data/`
- Logs may contain sensitive information
- Regular cleanup recommended

### Network Security
- All communication with Steam uses official APIs
- No data sent to third parties
- Local-only operation by default

## Security Checklist

Before deploying to production:

- [ ] Enable credential encryption
- [ ] Set restrictive file permissions
- [ ] Use environment variables for secrets
- [ ] Enable audit logging
- [ ] Set up monitoring and alerts
- [ ] Review and update dependencies
- [ ] Run security audit: `npm audit`
- [ ] Test rate limiting
- [ ] Verify backups work
- [ ] Document incident response plan

## Contact

- **Security Email**: stolenactdev@gmail.com
- **GitHub Security**: Use "Security" tab for private reports
- **General Issues**: Use public issues (non-security only)

---

**Last Updated**: 2025-11-23