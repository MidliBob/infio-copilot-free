#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Get version from command line argument
const version = process.argv[2];
if (!version) {
    console.error('Error: Please provide version as argument');
    process.exit(1);
}

try {
    // Read CHANGELOG.yaml
    const changelogPath = path.join(process.cwd(), 'CHANGELOG.yaml');
    const content = fs.readFileSync(changelogPath, 'utf8');
    
    // Parse YAML content
    const changelog = yaml.parse(content);
    
    if (!changelog || !Array.isArray(changelog.releases)) {
        console.error('Error: Invalid changelog format. Expected array of releases.');
        process.exit(1);
    }
    
    // Find the release entry for the specified version
    const release = changelog.releases.find(r => r.version === version);
    
    if (!release) {
        console.error(`Error: No changelog found for version ${version}`);
        process.exit(1);
    }
    
    // Format the release notes
    let output = '';
    
    // Features
    if (release.features && release.features.length > 0) {
        output += '### ✨ New Features\n\n';
        release.features.forEach(feature => {
            output += `- ${feature}\n`;
        });
        output += '\n';
    }
    
    // Fixes
    if (release.fixes && release.fixes.length > 0) {
        output += '### 🐛 Bug Fixes\n\n';
        release.fixes.forEach(fix => {
            output += `- ${fix}\n`;
        });
        output += '\n';
    }
    
    // Improvements
    if (release.improvements && release.improvements.length > 0) {
        output += '### 🚀 Improvements\n\n';
        release.improvements.forEach(improvement => {
            output += `- ${improvement}\n`;
        });
        output += '\n';
    }
    
    // Other changes
    if (release.other && release.other.length > 0) {
        output += '### 📝 Other Changes\n\n';
        release.other.forEach(change => {
            output += `- ${change}\n`;
        });
    }
    
    if (!output) {
        console.error('Error: No changes found in the release');
        process.exit(1);
    }
    
    // Output the formatted release notes
    console.log(output.trim());
    
} catch (error) {
    console.error(`Error processing changelog: ${error.message}`);
    process.exit(1);
}
