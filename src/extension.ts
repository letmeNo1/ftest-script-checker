import * as vscode from 'vscode';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('ftest');
    context.subscriptions.push(diagnosticCollection);

    // 监听文件变化
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
// 【高亮】testcase_name 显示为蓝色（可自己改颜色）
// =============================================================================
function highlightTestCaseName(document: vscode.TextDocument) {
    if (document.languageId !== 'ftest') return;

    const decorations: vscode.DecorationOptions[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // 定义样式：蓝色加粗
    const testCaseNameDecoration = vscode.window.createTextEditorDecorationType({
        color: '#4FC1FF', // 蓝色 → 可自己改颜色
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
// 【语法校验】修复赋值/断言误判问题
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

        // 1. 顶层 testcase_name
        if (trimLine.startsWith('testcase_name:')) {
            const value = trimLine.split(':', 2)[1]?.trim();
            if (!value) addError(diagnostics, lineNum, 'testcase_name 不能为空');
            return;
        }

        // 2. step 块
        if (trimLine.match(/^step\d*:/)) {
            inStep = true;
            return;
        }

        // 不在 step 内 → 非法
        if (!inStep) {
            addError(diagnostics, lineNum, '非法语句：必须写在 step 内部');
            return;
        }

        // ====================
        // step 内部语法（修复赋值/断言误判）
        // ====================
        // 匹配：前后不是=、<、>的单个=，避免误判==/<=/>=
        const hasAssign = /(?<!=|>|<)=(?!=|>|<)/.test(trimLine);
        const hasAssert = /==|<=|>=|<|>/.test(trimLine);

        if (hasAssign && hasAssert) {
            addError(diagnostics, lineNum, '一行只能是赋值(=)或断言(==/<>)');
            return;
        }

        if (hasAssign) {
            const parts = trimLine.split('=').map(i => i.trim());
            if (parts.length !== 2) {
                addError(diagnostics, lineNum, '赋值格式：key = value');
                return;
            }

            const [key, value] = parts;

            // key 必须是合法字符（字母/下划线/数字，不能以数字开头）
            const keyReg = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
            if (!keyReg.test(key)) {
                addError(diagnostics, lineNum, 'key 必须是字母/下划线开头的合法字符');
                return;
            }
        }
        else if (hasAssert) {
            // 无任何强制变量要求，支持任意变量断言：xxx==222 / a>10 / b<=5 等
        }
        else {
            addError(diagnostics, lineNum, '仅支持赋值或断言语句');
        }
    });

    if (!hasTestCaseName) {
        addError(diagnostics, 0, '必须包含 testcase_name');
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

// 添加错误
function addError(diag: vscode.Diagnostic[], line: number, message: string) {
    const range = new vscode.Range(line, 0, line, Number.MAX_VALUE);
    diag.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error));
}

export function deactivate() {
    diagnosticCollection?.clear();
}