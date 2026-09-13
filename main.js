import plugin from '../plugin.json';

const dialogs = acode.require('dialogs');
const terminal = acode.require('terminal');
const fsOperation = acode.require('fsOperation');

class AlsiAiAgent {
  async init() {
    this.createMinimalistUi();
    
    // Register command so you can open it via Ctrl+Shift+P
    editorManager.editor.commands.addCommand({
      name: 'alsi-agent-toggle',
      description: 'Toggle ALSI Ai Agent UI',
      exec: () => this.toggleUi(),
    });
  }

  createMinimalistUi() {
    this.panel = document.createElement('div');
    this.panel.id = 'alsi-agent-panel';
    
    // Sleek, dark-mode styling for the floating sidebar
    this.panel.innerHTML = `
      <style>
        #alsi-agent-panel {
          position: fixed; right: -320px; top: 0; width: 300px; height: 100%;
          background: #121212; color: #e0e0e0; z-index: 9999;
          transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border-left: 1px solid #2a2a2a; font-family: system-ui;
          display: flex; flex-direction: column; box-shadow: -5px 0 15px rgba(0,0,0,0.5);
        }
        #alsi-agent-panel.open { right: 0; }
        .alsi-header { padding: 15px; background: #1a1a1a; font-weight: bold; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
        .alsi-close { cursor: pointer; color: #ff5555; font-size: 18px; }
        .alsi-body { padding: 15px; flex: 1; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
        input, button { width: 100%; padding: 12px; border-radius: 8px; border: none; background: #222; color: #fff; font-size: 14px; }
        input:focus { outline: 1px solid #4caf50; }
        button { background: #4caf50; font-weight: bold; cursor: pointer; transition: 0.2s; }
        button:active { transform: scale(0.98); }
        .alsi-log { font-size: 12px; color: #888; margin-top: auto; white-space: pre-wrap; }
      </style>
      
      <div class="alsi-header">
        <span>⚡ ALSI Ai Agent</span>
        <span class="alsi-close" id="alsi-close-btn">✖</span>
      </div>
      
      <div class="alsi-body">
        <div id="alsi-setup">
          <input type="password" id="alsi-key" placeholder="Paste OpenRouter Key..." />
          <button id="alsi-connect">Connect</button>
        </div>
        
        <div id="alsi-chat-area" style="display:none;">
          <input type="text" id="alsi-prompt" placeholder="Ask ALSI to run a command..." />
          <button id="alsi-send">Send Command</button>
          <div class="alsi-log" id="alsi-log">Status: Ready</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.panel);
    this.bindEvents();
    this.checkSavedKey();
  }

  bindEvents() {
    document.getElementById('alsi-close-btn').onclick = () => this.toggleUi();
    
    document.getElementById('alsi-connect').onclick = () => {
      const key = document.getElementById('alsi-key').value;
      if (key) {
        localStorage.setItem('alsi_openrouter_key', key);
        this.checkSavedKey();
        acode.alert('ALSI Ai Agent', 'API Key Connected successfully!');
      }
    };

    document.getElementById('alsi-send').onclick = () => {
      const prompt = document.getElementById('alsi-prompt').value;
      if (prompt) this.executeAgentTask(prompt);
    };
  }

  checkSavedKey() {
    const key = localStorage.getItem('alsi_openrouter_key');
    if (key) {
      document.getElementById('alsi-setup').style.display = 'none';
      document.getElementById('alsi-chat-area').style.display = 'block';
    }
  }

  toggleUi() {
    this.panel.classList.toggle('open');
  }

  log(msg) {
    document.getElementById('alsi-log').innerText = msg;
  }

  // --- THE BRAIN: OpenRouter & Tool Calling ---
  async executeAgentTask(userPrompt) {
    this.log("Processing with ALSI Ai...");
    const apiKey = localStorage.getItem('alsi_openrouter_key');
    
    // Give the AI the ability to use tools
    const tools = [
      {
        type: "function",
        function: {
          name: "run_terminal",
          description: "Run a shell/bash command in the Acode environment",
          parameters: {
            type: "object",
            properties: { command: { type: "string" } },
            required: ["command"]
          }
        }
      }
    ];

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "qwen/qwen-2.5-coder-32b-instruct", // Excellent and fast for coding/terminal logic
          messages: [{ role: "user", content: userPrompt }],
          tools: tools,
          tool_choice: "auto"
        })
      });

      const data = await response.json();
      const message = data.choices[0].message;

      // Check if the AI decided to run a terminal command
      if (message.tool_calls) {
        for (let toolCall of message.tool_calls) {
          if (toolCall.function.name === "run_terminal") {
            const args = JSON.parse(toolCall.function.arguments);
            this.log(`Executing: ${args.command}`);
            await this.runTerminalCommand(args.command);
          }
        }
      } else {
        this.log(`ALSI says: ${message.content}`);
      }

    } catch (err) {
      this.log("Error: " + err.message);
    }
  }

  // --- THE HANDS: Acode Terminal API ---
  async runTerminalCommand(command) {
    try {
      // Connects to Acode's backend terminal (works great if Termux environment is linked)
      const term = await terminal.createServer({ name: 'ALSI Execution' });
      // Execute command with a carriage return
      terminal.write(term.id, command + '\r\n'); 
      this.log(`Successfully executed: ${command}`);
    } catch (error) {
      this.log("Terminal failed: Ensure server mode is active.");
      console.error(error);
    }
  }

  async destroy() {
    if (this.panel) this.panel.remove();
    editorManager.editor.commands.removeCommand('alsi-agent-toggle');
  }
}

// Acode Plugin Lifecycle Setup
if (window.acode) {
  const alsiPlugin = new AlsiAiAgent();
  acode.setPluginInit(plugin.id, async (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
    await alsiPlugin.init();
  });
  acode.setPluginUnmount(plugin.id, () => {
    alsiPlugin.destroy();
  });
}

