import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const provider = new ZenChatViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ZenChatViewProvider.viewType, provider)
    );
}

class ZenChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'zen-chatbox-view';

    constructor(private readonly _context: vscode.ExtensionContext) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]

        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._context.extensionUri] };
        webviewView.webview.html = this._getHtmlForWebview();

        webviewView.webview.onDidReceiveMessage(async (message: any) => {
            if (message.command === 'askAI') {
                this.hasRead = false;
                const aiResponse = await this.callTheAi(message.text, []);
                webviewView.webview.postMessage({ command: 'aiResponse', text: aiResponse });
            }
        });
    }

    private async callTheAi(userText: string, history: any[]): Promise<string> {
        const apiKey = 'YOUR_GROQ_API_KEY_HERE';
        
        // Auto-read visible file on first call
        if (history.length === 0 && !this.hasRead) {
            const editor = vscode.window.visibleTextEditors[0];
            if (editor) {
                const fileContent = editor.document.getText();
                const fileName = editor.document.fileName.split('\\').pop();
                this.hasRead = true;
                history.push({ role: "user", content: `Here is the file (${fileName}):\n\n${fileContent}` });
            }
        }
        
        if (userText) history.push({ role: "user", content: userText });

        const data = {
            model: "llama-3.3-70b-versatile",
            messages: [
                { 
                    role: "system", 
                    content: "TREE-SITTER PRECISION REFACTORING: 1. Use AST node logic to identify the EXACT statement or expression containing the error. 2. MINIMIZE edit distance: Only fix the specific line/node that needs changing. 3. DO NOT output full file or large context. 4. Use replace_code_block with MINIMAL search_block that uniquely identifies the error. 5. For typos/semicolons: search_block should contain ONLY that line. 6. After replacement, output ONLY one-sentence confirmation. 7. For SYNTAX errors: missing semicolons, brackets, parentheses, keywords - fix only that node. 8. For LOGICAL errors: wrong operators, conditions, comparisons - fix only the expression. 9. Ensure bracket matching: each { has matching }. 10. Do NOT display corrected code in chat. 11. If no errors, say 'No errors detected.'\n\nRULES FOR WEATHER/TIME: Only call when user explicitly asks."
                },
                ...history
            ],
            tools: [
                { "type": "function", "function": { "name": "replace_code_block", "description": "Replace text in file", "parameters": { "type": "object", "properties": { "search_block": { "type": "string" }, "replace_block": { "type": "string" } }, "required": ["search_block", "replace_block"] } } },
                { "type": "function", "function": { "name": "get_current_time", "description": "Get time", "parameters": { "type": "object", "properties": { "location": { "type": "string" } }, "required": ["location"] } } },
                { "type": "function", "function": { "name": "get_weather", "description": "Get weather", "parameters": { "type": "object", "properties": { "location": { "type": "string" } }, "required": ["location"] } } }
            ],
            temperature: 0.1
        };

        webviewView.webview.html = this._getHtmlForWebview();


        webviewView.webview.onDidReceiveMessage(message => {
            if (message.command === 'getFileText') {
                const editor = vscode.window.visibleTextEditors[0];
                const text = editor ? editor.document.getText() : "System: No file is currently open.";
                webviewView.webview.postMessage({ command: 'fileTextResult', text: text });
            }
            
            if (message.command === 'writeFileText') {
                const editor = vscode.window.visibleTextEditors[0];
                if (editor) {
                    editor.edit(editBuilder => {
                        const start = new vscode.Position(0, 0);
                        const end = new vscode.Position(editor.document.lineCount, 0);
                        const allRange = new vscode.Range(start, end);
                        editBuilder.replace(allRange, message.text);
                    }).then(success => {
                        if (success) {
                            webviewView.webview.postMessage({ command: 'writeResult', status: 'Success! File updated.' });
                        } else {
                            webviewView.webview.postMessage({ command: 'writeResult', status: 'Error: Failed to write to file.' });
                        }
                    });
                } else {
                    webviewView.webview.postMessage({ command: 'writeResult', status: 'Error: No visible file found.' });

        const json: any = await res.json();
        const msg = json.choices[0].message;
        
        if (msg.tool_calls) {
            history.push(msg);
            for (const tc of msg.tool_calls) {
                this.logger.show(true);
                this.logger.appendLine(`[Tool Usage] AI calling: ${tc.function.name}`);
                
                try {
                    const args = JSON.parse(tc.function.arguments);
                    
                    if (tc.function.name === 'replace_code_block') {
                        const editor = vscode.window.visibleTextEditors[0];
                        if (editor) {
                            const fullText = editor.document.getText();
                            const lines = fullText.split('\n');

                            // Normalize line endings
                            const normalizedFull   = fullText.replace(/\r\n/g, '\n');
                            let normalizedSearch  = args.search_block.replace(/\r\n/g, '\n');
                            let normalizedReplace = args.replace_block.replace(/\r\n/g, '\n');

                            // Try exact match first
                            if (normalizedFull.includes(normalizedSearch)) {
                                const newText = normalizedFull.replace(normalizedSearch, normalizedReplace);
                                const fullRange = new vscode.Range(
                                    editor.document.positionAt(0),
                                    editor.document.positionAt(fullText.length)
                                );
                                const success = await editor.edit(eb => eb.replace(fullRange, newText));
                                this.logger.appendLine(`[Success] Replaced code block (exact match).`);
                                history.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: success ? "✓ Code replaced successfully." : "✗ Edit operation failed." });
                            } else {
                                // Try fuzzy match: normalize all whitespace aggressively
                                const normalize = (str: string) => str.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0).join('\n');
                                const searchNorm = normalize(normalizedSearch);
                                const fullNorm = normalize(normalizedFull);
                                
                                if (fullNorm.includes(searchNorm)) {
                                    const replaceNorm = normalize(normalizedReplace);
                                    const newText = fullNorm.replace(searchNorm, replaceNorm);
                                    const fullRange = new vscode.Range(
                                        editor.document.positionAt(0),
                                        editor.document.positionAt(fullText.length)
                                    );
                                    const success = await editor.edit(eb => eb.replace(fullRange, newText));
                                    this.logger.appendLine(`[Success] Replaced code block (fuzzy match).`);
                                    history.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: success ? "✓ Code replaced successfully." : "✗ Edit operation failed." });
                                } else {
                                    // Last resort: try regex-based fuzzy search with tolerance
                                    const regexSearch = normalizedSearch.split('\n')[0]; // Use first line as key
                                    if (normalizedFull.includes(regexSearch)) {
                                        const newText = normalizedFull.replace(normalizedSearch, normalizedReplace);
                                        const fullRange = new vscode.Range(
                                            editor.document.positionAt(0),
                                            editor.document.positionAt(fullText.length)
                                        );
                                        const success = await editor.edit(eb => eb.replace(fullRange, newText));
                                        this.logger.appendLine(`[Success] Replaced code block (pattern match).`);
                                        history.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: success ? "✓ Code replaced successfully." : "✗ Edit operation failed." });
                                    } else {
                                        // Mismatch
                                        const searchLines = normalizedSearch.split('\n');
                                        this.logger.appendLine(`[Mismatch] Could not find code block (${searchLines.length} lines).`);
                                        for (let i = 0; i < Math.min(searchLines.length, 3); i++) {
                                            this.logger.appendLine(`  L${i + 1}: "${searchLines[i].substring(0, 60)}${searchLines[i].length > 60 ? '...' : ''}"`);
                                        }
                                        history.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: "✗ Could not find code. Please ensure you provide exact code from the file to replace." });
                                    }
                                }
                            }
                        }
                    } else if (tc.function.name === 'get_current_time') {
                        try {
                            const location = args.location || 'UTC';
                            const timeData = this.getTimeForLocation(location);
                            history.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: timeData });
                        } catch (err) {
                            history.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: `Error: Could not get time for ${args.location || 'UTC'}.` });
                        }
                    } else if (tc.function.name === 'get_weather') {
                        try {
                            const location = args.location || 'London';
                            const weatherData = this.getWeatherForLocation(location);
                            history.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: weatherData });
                        } catch (err) {
                            history.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: `Error: Could not get weather for ${args.location || 'London'}.` });
                        }
                    }
                } catch (e) {
                    this.logger.appendLine(`[Error] Tool failure: ${e}`);
                }
            }

            if (message.command === 'replaceFileText') {
                const editor = vscode.window.visibleTextEditors[0];
                if (editor) {
                    const fullText = editor.document.getText();
                    const startIndex = fullText.indexOf(message.search);
                    
                    if (startIndex !== -1) {
                        const startPos = editor.document.positionAt(startIndex);
                        const endPos = editor.document.positionAt(startIndex + message.search.length);
                        const targetRange = new vscode.Range(startPos, endPos);
                        
                        editor.edit(editBuilder => {
                            editBuilder.replace(targetRange, message.replace);
                        }).then(success => {
                            webviewView.webview.postMessage({ 
                                command: 'replaceResult', 
                                status: success ? 'Success! Code block replaced.' : 'Error: Edit failed.' 
                            });
                        });
                    } else {
                        webviewView.webview.postMessage({ 
                            command: 'replaceResult', 
                            status: 'Error: Could not find that exact code block in the file.' 
                        });
                    }
                } else {
                    webviewView.webview.postMessage({ command: 'replaceResult', status: 'Error: No visible file found.' });
                }
            }
        });
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="en">
<head>  
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zen Chatbox</title>
    
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script> 
    
    <style>
        html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }
        body { background-color: #0d0d0d; color: #f0f0f0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; flex-direction: column; }
        
        .chat-container { flex-grow: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; scroll-behavior: smooth; }
        .message { max-width: 85%; padding: 12px 18px; border-radius: 12px; font-size: 14px; line-height: 1.5; letter-spacing: 0.3px; }
        .user-message { background-color: #2b2b2b; align-self: flex-end; border-bottom-right-radius: 2px; }
        .ai-message { background-color: #1a1a1a; align-self: flex-start; border-bottom-left-radius: 2px; border: 1px solid #333; width: 100%; }
        
        pre { background-color: #000000; padding: 14px; border-radius: 8px; overflow-x: auto; margin-top: 8px; border: 1px solid #333; }
        pre code { background-color: transparent !important; color: #569cd6; font-family: Consolas, 'Courier New', monospace; }
        p code { background-color: #222 !important; padding: 2px 4px; border-radius: 4px; color: #ce9178; font-family: Consolas, 'Courier New', monospace; }
        
        .input-container { flex-shrink: 0; padding: 16px 20px; background-color: #0d0d0d; border-top: 1px solid #222; display: flex; gap: 10px; align-items: center; }
        input { flex: 1; background-color: transparent; border: 1px solid #444; color: #fff; padding: 12px 16px; border-radius: 8px; font-size: 14px; outline: none; transition: border 0.3s; }
        input:focus { border-color: #888; }
        .icon-btn { background: transparent; border: 1px solid #444; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 10px; transition: all 0.2s; color: #fff; }
        .icon-btn:hover { background-color: #2a2a2a; border-color: #666; }
        .icon-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
        #sendBtn { display: none; }
    </style>
</head>
<body> 
    <div class="chat-container" id="chatContainer">
        <div class="message ai-message">System online. Ready to assist.</div>
    </div>
    <div class="input-container">
        <input type="text" id="userInput" placeholder="Type a message..."> 
        <button id="sendBtn" class="icon-btn" title="Send">
            <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
    </div>
    
    <script>
    const vscode = acquireVsCodeApi(); 
    let chatHistory = [];

    function getFileFromVSCode() {
        return new Promise((resolve) => {
            const listener = event => {
                const message = event.data;
                if (message.command === 'fileTextResult') {
                    window.removeEventListener('message', listener);
                    resolve(message.text);
                }
            };
            window.addEventListener('message', listener);
            vscode.postMessage({ command: 'getFileText' }); 
        });
    }

    function writeFileToVSCode(newCode) {
        return new Promise((resolve) => {
            const listener = event => {
                const message = event.data;
                if (message.command === 'writeResult') {
                    window.removeEventListener('message', listener);
                    resolve(message.status);
                }
            };
            window.addEventListener('message', listener);
            vscode.postMessage({ command: 'writeFileText', text: newCode });
        });
    }

    const chatContainer = document.getElementById('chatContainer');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');

    function addMessage(text, isUser) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ' + (isUser ? 'user-message' : 'ai-message');
        if (isUser) {
            msgDiv.textContent = text;
        } else {
            msgDiv.innerHTML = marked.parse(text);
        }
        chatContainer.appendChild(msgDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    async function callTheAi(userText) {
        const apiKey = 'YOUR_GROQ_KEY_HERE'; 
        const url = 'https://api.groq.com/openai/v1/chat/completions';

        if (userText) {
            chatHistory.push({ role: "user", content: userText });
        }

        const data = {
            model: "llama-3.3-70b-versatile", 
            messages: [
                { 
                    role: "system", 
                    content: "You are Zen, a sharp coding buddy. Write standard Python without Python 3 type hints, and never include comments in the generated code. RULE 1: When chatting normally, ALWAYS wrap code in Markdown triple backticks. RULE 2: When using the write or replace tools, do NOT use markdown backticks inside the JSON." 
                },
                ...chatHistory
            ],
            tools: [
                {
                    "type": "function",
                    "function": {
                        "name": "read_current_editor_file",
                        "description": "Reads the contents of the currently visible text editor in VS Code.",
                        "parameters": {
                            "type": "object",
                            "properties": {}
                        }
                    }
                },
                {
                    "type": "function",
                    "function": {
                        "name": "write_to_current_file",
                        "description": "Overwrites the contents of the currently visible text editor with new code. Call this when asked to fix or update the file entirely.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "code": {
                                    "type": "string",
                                    "description": "The complete new code content. NEVER wrap this in markdown backticks."
                                }
                            },
                            "required": ["code"]
                        }
                    }
                },
                {
                    "type": "function",
                    "function": {
                        "name": "replace_code_block",
                        "description": "Replaces a specific block of code in the current file. Use this for targeted fixes in large files instead of rewriting the whole file.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "search_block": {
                                    "type": "string",
                                    "description": "The exact existing code block to find. Must match the file's text exactly."
                                },
                                "replace_block": {
                                    "type": "string",
                                    "description": "The new corrected code block. NEVER wrap this in markdown backticks."
                                }
                            },
                            "required": ["search_block", "replace_block"]
                        }
                    }
                },
                {
                    "type": "function",
                    "function": {
                        "name": "get_global_time",
                        "description": "Gets the current exact time for a specific global time zone.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "timeZone": {
                                    "type": "string",
                                    "description": "The exact IANA time zone string, e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo'"
                                }
                            },
                            "required": ["timeZone"]
                        }
                    }
                },
                {
                    "type": "function",
                    "function": {
                        "name": "get_weather",
                        "description": "Gets the current weather for a specific city.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "city": {
                                    "type": "string",
                                    "description": "The name of the city, e.g., Tokyo, Seattle, London"
                                }
                            },
                            "required": ["city"]
                        }
                    }
                }
            ],
            tool_choice: "auto",
            parallel_tool_calls: false
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            
            if (!response.ok) {
                chatHistory.pop(); 
                const errorMsg = result.error && result.error.message ? result.error.message : 'Unknown error';
                return 'Groq API Error (' + response.status + '): ' + errorMsg;
            }

            if (!result.choices || result.choices.length === 0) {
                chatHistory.pop();
                return 'System Error: The AI returned an empty response.';
            }

            const responseMessage = result.choices[0].message;

            if (responseMessage.tool_calls) {
                chatHistory.push(responseMessage); 
                
                for (const toolCall of responseMessage.tool_calls) {
                    if (toolCall.function.name === "read_current_editor_file") {
                        const fileContent = await getFileFromVSCode();
                        chatHistory.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            name: toolCall.function.name,
                            content: fileContent
                        });
                    }
                    else if (toolCall.function.name === "write_to_current_file") {
                        const args = JSON.parse(toolCall.function.arguments);
                        let cleanCode = args.code;
                        
                        if (cleanCode.indexOf('\`\`\`') === 0) {
                            cleanCode = cleanCode.replace(/^\`\`\`[a-zA-Z]*\\n/, '').replace(/\\n\`\`\`$/, '');
                        }
                        
                        const resultStatus = await writeFileToVSCode(cleanCode);
                        chatHistory.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            name: toolCall.function.name,
                            content: resultStatus
                        });
                    }
                    else if (toolCall.function.name === "replace_code_block") {
                        const args = JSON.parse(toolCall.function.arguments);
                        
                        const resultStatus = await new Promise((resolve) => {
                            const listener = event => {
                                const message = event.data;
                                if (message.command === 'replaceResult') {
                                    window.removeEventListener('message', listener);
                                    resolve(message.status);
                                }
                            };
                            window.addEventListener('message', listener);
                            vscode.postMessage({ 
                                command: 'replaceFileText', 
                                search: args.search_block, 
                                replace: args.replace_block 
                            });
                        });
                        
                        chatHistory.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            name: toolCall.function.name,
                            content: resultStatus
                        });
                    }
                    else if (toolCall.function.name === "get_global_time") {
                        const args = JSON.parse(toolCall.function.arguments);
                        let globalTime = "";
                        
                        try {
                            const options = { timeZone: args.timeZone, timeStyle: 'medium', dateStyle: 'medium' };
                            globalTime = new Intl.DateTimeFormat('en-US', options).format(new Date());
                        } catch (error) {
                            globalTime = "Invalid time zone requested.";
                        }
                        
                        chatHistory.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            name: toolCall.function.name,
                            content: "The current date and time in " + args.timeZone + " is: " + globalTime
                        });
                    }
                    else if (toolCall.function.name === "get_weather") {
                        const args = JSON.parse(toolCall.function.arguments);
                        let weatherInfo = "";
                        
                        try {
                            const weatherRes = await fetch('https://wttr.in/' + encodeURIComponent(args.city) + '?format=j1');
                            const weatherData = await weatherRes.json();
                            const tempC = weatherData.current_condition[0].temp_C;
                            const condition = weatherData.current_condition[0].weatherDesc[0].value;
                            weatherInfo = 'The current weather in ' + args.city + ' is ' + tempC + '°C and ' + condition + '.';
                        } catch (error) {
                            weatherInfo = "Failed to fetch weather data from the internet.";
                        }
                        
                        chatHistory.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            name: toolCall.function.name,
                            content: weatherInfo
                        });
                    }
                }
                return await callTheAi(""); 
            }

            const aiReply = responseMessage.content;
            chatHistory.push({ role: "assistant", content: aiReply });
            return aiReply;

        } catch (error) {
            chatHistory.pop(); 
            return 'JavaScript Error: ' + error.message;
        }
    }

    async function handleSend() {
        const text = userInput.value.trim();
        if (text) {
            addMessage(text, true);
            userInput.value = '';
            sendBtn.style.display = 'none';

            const loadingMsgDiv = document.createElement('div');
            loadingMsgDiv.className = 'message ai-message';
            loadingMsgDiv.textContent = 'Thinking...';
            chatContainer.appendChild(loadingMsgDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;

            const aiResponse = await callTheAi(text);
            
            loadingMsgDiv.innerHTML = marked.parse(aiResponse);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }

    sendBtn.addEventListener('click', handleSend);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    userInput.addEventListener('input', () => {
        sendBtn.style.display = userInput.value.trim().length > 0 ? 'flex' : 'none';
    });
    </script>
</body>
</html>`;
    }

    private getTimeForLocation(location: string): string {
        const timezoneOffsets: { [key: string]: number } = {
            'utc': 0, 'london': 0, 'india': 5.5, 'bali': 8, 'tokyo': 9, 'sydney': 10,
            'dubai': 4, 'mumbai': 5.5, 'paris': 1, 'berlin': 1, 'toronto': -5, 'singapore': 8,
            'bangkok': 7, 'los angeles': -8, 'san francisco': -8, 'chicago': -6, 'mexico': -6, 'newyork': -5
        };
        const offset = timezoneOffsets[location.toLowerCase()] ?? 0;
        const utcTime = new Date();
        const localTime = new Date(utcTime.getTime() + (offset * 60 * 60 * 1000));
        const timeStr = localTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        return `Current time in ${location}: ${timeStr}`;
    }

    private getWeatherForLocation(location: string): string {
        const weatherData: { [key: string]: string } = {
            'london': 'Cloudy, 15°C', 'tokyo': 'Clear, 22°C', 'sydney': 'Sunny, 25°C',
            'bali': 'Partly Cloudy, 28°C', 'dubai': 'Sunny, 35°C', 'mumbai': 'Humid, 32°C',
            'paris': 'Rainy, 12°C', 'berlin': 'Cloudy, 14°C', 'toronto': 'Cold, 5°C',
            'singapore': 'Humid, 31°C', 'bangkok': 'Warm, 29°C', 'los angeles': 'Sunny, 24°C',
            'san francisco': 'Foggy, 18°C', 'chicago': 'Partly Cloudy, 8°C', 'mexico': 'Warm, 26°C',
            'newyork': 'Clear, 16°C', 'india': 'Warm, 30°C'
        };
        const weather = weatherData[location.toLowerCase()] || 'Moderate weather, 20°C';
        return `Weather in ${location}: ${weather}`;
    }
}

export function deactivate() {}