import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Automated Audit: Matomo Consent Manager Coverage & Integrity', () => {

    const rootDir = path.resolve(__dirname, '..');

    function getAllHtmlFiles(dir, fileList = []) {
        const files = fs.readdirSync(dir);
        files.forEach((file) => {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                if (!['node_modules', 'vendor', '_site', '.git'].includes(file)) {
                    getAllHtmlFiles(filePath, fileList);
                }
            } else if (file.endsWith('.html')) {
                fileList.push(filePath);
            }
        });
        return fileList;
    }

    const htmlFiles = getAllHtmlFiles(rootDir);

    test('Rule 1: No legacy or hardcoded Matomo tracker snippets exist outside analytics-consent.js', async () => {
        const legacyPattern = /matomo\.js|matomo\.php|_paq\.push\(\s*\['setTrackerUrl'/i;

        for (const filePath of htmlFiles) {
            const relativePath = path.relative(rootDir, filePath);
            const content = fs.readFileSync(filePath, 'utf-8');

            // Skip CHANGELOG and doc files that reference matomo.js as text
            if (relativePath === 'CHANGELOG.html' || relativePath.startsWith('docs/')) continue;

            const matches = legacyPattern.test(content);
            expect(matches, `Legacy/hardcoded Matomo tracker snippet found in ${relativePath}`).toBe(false);
        }
    });

    test('Rule 2: All public HTML pages have access to the Consent Manager (via head.html or global-header.js)', async () => {
        for (const filePath of htmlFiles) {
            const relativePath = path.relative(rootDir, filePath);
            // Skip partials, layouts, and redirects
            if (relativePath.startsWith('_includes') || relativePath.startsWith('_layouts') || relativePath === 'changelog/index.html') {
                continue;
            }

            const content = fs.readFileSync(filePath, 'utf-8');

            const usesHead = content.includes('_includes/head.html') ||
                content.includes('{% include head.html %}') ||
                /layout:\s*(default|page|post|home)/.test(content);

            const usesGlobalHeader = content.includes('global-header.js');
            const loadsDirectConsent = content.includes('analytics-consent.js');

            const isCovered = usesHead || usesGlobalHeader || loadsDirectConsent;

            expect(isCovered, `Public page ${relativePath} has no access to the consent manager!`).toBe(true);
        }
    });

    test('Rule 3: No HTML page has duplicate static inclusions of analytics-consent.js', async () => {
        for (const filePath of htmlFiles) {
            const relativePath = path.relative(rootDir, filePath);
            const content = fs.readFileSync(filePath, 'utf-8');

            // Count direct script tags for analytics-consent.js
            const directScriptMatches = (content.match(/analytics-consent\.js/g) || []).length;

            expect(directScriptMatches, `Duplicate or unnecessary direct inclusion of analytics-consent.js in ${relativePath}`).toBeLessThanOrEqual(1);
        }
    });
});
