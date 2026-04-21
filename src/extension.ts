import * as vscode from 'vscode';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('ftest');
    context.subscriptions.push(diagnosticCollection);

    // Listen for file changes
    vscode.workspace.onDidOpenTextDocument(doc => {
        validateScript(doc);
        highlightTestCaseName(doc);
    });
    vscode.workspace.onDidChangeTextDocument(e => {
        validateScript(e.document);
        highlightTestCaseName(e.document);
    });
    vscode.workspace.onDidSaveTextDocument(doc => {
        validateScript(doc);
        highlightTestCaseName(doc);
    });

    if (vscode.window.activeTextEditor) {
        validateScript(vscode.window.activeTextEditor.document);
        highlightTestCaseName(vscode.window.activeTextEditor.document);
    }
}

// =============================================================================
// Highlight testcase_name in blue (color customizable)
// =============================================================================
function highlightTestCaseName(document: vscode.TextDocument) {
    if (document.languageId !== 'ftest') return;

    const decorations: vscode.DecorationOptions[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // Style: blue bold
    const testCaseNameDecoration = vscode.window.createTextEditorDecorationType({
        color: '#4FC1FF',
        fontWeight: 'bold',
        fontSize: '13px'
    });

    lines.forEach((line, lineNum) => {
        const trim = line.trim();
        if (trim.startsWith('testcase_name:')) {
            const match = line.match(/testcase_name:/);
            if (match) {
                const startPos = match.index!;
                const endPos = startPos + match[0].length;
                const range = new vscode.Range(lineNum, startPos, lineNum, endPos);
                decorations.push({ range });
            }
        }
    });

    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document === document) {
        editor.setDecorations(testCaseNameDecoration, decorations);
    }
}

// =============================================================================
// Syntax validation (fixed assignment/assertion misjudgment)
// =============================================================================
function validateScript(document: vscode.TextDocument) {
    if (document.languageId !== 'ftest') {
        diagnosticCollection.clear();
        return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const lines = document.getText().split('\n');
    const hasTestCaseName = lines.some(line => line.trim().startsWith('testcase_name:'));
    
    let inStep = false;

    lines.forEach((line, lineNum) => {
        const trimLine = line.trim();
        if (!trimLine || trimLine.startsWith('#')) return;

        // Top-level testcase_name
        if (trimLine.startsWith('testcase_name:')) {
            const value = trimLine.split(':', 2)[1]?.trim();
            if (!value) addError(diagnostics, lineNum, 'testcase_name cannot be empty');
            return;
        }

        // Step block
        if (trimLine.match(/^step\d*:/)) {
            inStep = true;
            return;
        }

        // Not inside step → invalid
        if (!inStep) {
            addError(diagnostics, lineNum, 'Invalid statement: must be inside a step block');
            return;
        }

        // ====================
        // Syntax inside step
        // ====================
        // Match single = (not part of ==/<=/>=) to avoid misjudgment
        const hasAssign = /(?<!=|>|<)=(?!=|>|<)/.test(trimLine);
        const hasAssert = /==|<=|>=|<|>/.test(trimLine);

        if (hasAssign && hasAssert) {
            addError(diagnostics, lineNum, 'Only assignment (=) or assertion (==/<>) allowed per line');
            return;
        }

        if (hasAssign) {
            const parts = trimLine.split('=').map(i => i.trim());
            if (parts.length !== 2) {
                addError(diagnostics, lineNum, 'Assignment format: key = value');
                return;
            }

            const [key, value] = parts;

            // Key must be valid (letters/underscores/numbers, cannot start with number)
            const keyReg = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
            if (!keyReg.test(key)) {
                addError(diagnostics, lineNum, 'Key must start with a letter or underscore');
                return;
            }
        }
        else if (hasAssert) {
            // Support any variable for assertion
        }
        else {
            addError(diagnostics, lineNum, 'Only assignment or assertion statements are supported');
        }
    });

    if (!hasTestCaseName) {
        addError(diagnostics, 0, 'testcase_name is required');
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

// Add error diagnostic
function addError(diag: vscode.Diagnostic[], line: number, message: string) {
    const range = new vscode.Range(line, 0, line, Number.MAX_VALUE);
    diag.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error));
}

export function deactivate() {
    diagnosticCollection?.clear();
}