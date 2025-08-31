# dep-lens

A powerful CLI tool for analyzing and visualizing project dependencies. Get insights into your project's dependency structure, identify potential issues, and maintain a healthy codebase.

## Features

- 📊 **Dependency Analysis** - Analyze production and development dependencies
- 🌳 **Dependency Tree** - Visualize dependency relationships
- 📈 **Statistics** - Get detailed statistics about your dependencies  
- 🔍 **Security Scanning** - Identify potential vulnerabilities (planned)
- 📦 **Multiple Formats** - Export results in JSON or human-readable format
- 🎯 **Configurable Depth** - Control analysis depth to avoid overwhelming output

## Installation

### Global Installation
```bash
npm install -g dep-lens
```

### Local Installation
```bash
npm install dep-lens
npx dep-lens
```

### Development Installation
```bash
cd dep-lens
npm install
npm link  # Makes dep-lens available globally for development
```

## Usage

### Basic Usage
```bash
# Analyze current directory
dep-lens

# Analyze specific project
dep-lens ./my-project

# Show help
dep-lens --help
```



## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
|      [--days=60]
|     [--include-dev] [--include-peer] [--include-optional]
|     [--registry=https://registry.npmjs.org]
|     [--scope-registry=@regitry-group=https://npm.pkg.github.com]
|     [--skip-registry=<scope>]
|     [--scope-auth=@regitry-group=env:GITHUB_TOKEN]
|     [--verbose]




## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Roadmap

- [ ] **Security Analysis** - Integration with npm audit
- [ ] **Outdated Package Detection** - Identify packages that need updates
- [ ] **Duplicate Detection** - Find duplicate dependencies across the tree
- [ ] **Bundle Size Analysis** - Analyze the impact of dependencies on bundle size
- [ ] **License Compliance** - Check license compatibility
- [ ] **Performance Metrics** - Measure dependency load times
- [ ] **CI/CD Integration** - GitHub Actions, GitLab CI support
- [ ] **Web Dashboard** - Interactive web interface
- [ ] **Multiple Package Managers** - Support for yarn, pnpm

## Requirements

- Node.js >= 16.0.0
- npm or yarn

## License

MIT License - see [LICENSE](LICENSE) file for details.

