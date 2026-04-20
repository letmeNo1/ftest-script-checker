import * as vscode from 'vscode';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('ftest');
    context.subscriptions.push(diagnosticCollection);

    // 监听文件变化，实时校验
    vscode.workspace.onDidOpenTextDocument(validateScript);
    vscode.workspace.onDidChangeTextDocument(e => validateScript(e.document));
    vscode.workspace.onDidSaveTextDocument(validateScript);

    if (vscode.window.activeTextEditor) {
        validateScript(vscode.window.activeTextEditor.document);
    }
}

// ftest 脚本核心校验逻辑
function validateScript(document: vscode.TextDocument) {
    // 只校验 .ftest 文件
    if (document.languageId !== 'ftest') {
        diagnosticCollection.clear();
        return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const lines = document.getText().split('\n').map(line => line.trimEnd());
    const hasTestCaseName = lines.some(line => line.trim().startsWith('testcase_name:'));
    let inStep = false;

    lines.forEach((line, lineNum) => {
        const trimLine = line.trim();
        if (!trimLine) return;

        // 1. 校验用例名称
        if (trimLine.startsWith('testcase_name:')) {
            const value = trimLine.split(':')[1]?.trim();
            if (!value) addError(diagnostics, lineNum, 'testcase_name 不能为空');
            return;
        }

        // 2. 匹配任意 step 步骤
        if (trimLine.match(/^step\d+:/)) {
            inStep = true;
            return;
        }

        // 3. Step 内部语法校验
        if (inStep) {
            const hasAssign = trimLine.includes('=');
            const hasAssert = /==|<|>/.test(trimLine);

            // 禁止赋值和断言混用
            if (hasAssign && hasAssert) {
                addError(diagnostics, lineNum, '语法错误：一行只能是赋值(=) 或 断言(==/< >)');
                return;
            }

            // 赋值语句校验
            if (hasAssign) {
                const parts = trimLine.split('=').map(i => i.trim());
                if (parts.length !== 2) {
                    addError(diagnostics, lineNum, '赋值格式错误：正确写法 key = value');
                    return;
                }
                const [key, value] = parts;
                const validKeys = ['bat_voltage', 'inject_hook', 'delay'];
                
                if (!validKeys.includes(key)) {
                    addError(diagnostics, lineNum, `仅支持字段：${validKeys.join('/')}`);
                    return;
                }

                // 值类型校验
                switch (key) {
                    case 'bat_voltage':
                    case 'delay':
                        if (isNaN(Number(value))) addError(diagnostics, lineNum, `${key} 必须是数字`);
                        break;
                    case 'inject_hook':
                        if (!value.match(/^0x[0-9a-fA-F]+$/) && isNaN(Number(value))) {
                            addError(diagnostics, lineNum, 'inject_hook 必须是0x开头十六进制或数字');
                        }
                        break;
                }
            }
            // 断言语句校验
            else if (hasAssert) {
                if (!trimLine.includes('app_bat_ctx.voltage')) {
                    addError(diagnostics, lineNum, '断言必须使用固定变量：app_bat_ctx.voltage');
                }
            }
            // 无效语法
            else {
                addError(diagnostics, lineNum, '仅支持赋值语句(=)或断言语句(==/< >)');
            }
        }
    });

    // 全局必填项校验
    if (!hasTestCaseName) addError(diagnostics, 0, '缺失必填字段：testcase_name');
    diagnosticCollection.set(document.uri, diagnostics);
}

// 添加错误提示
function addError(diag: vscode.Diagnostic[], line: number, message: string) {
    const range = new vscode.Range(line, 0, line, 1000);
    diag.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error));
}

export function deactivate() {
    diagnosticCollection?.clear();
}