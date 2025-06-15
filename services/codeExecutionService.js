const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class CodeExecutionService {
  constructor() {
    this.tempDir = path.join(__dirname, '../temp');
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
    }
  }

  async executeCode(language, code, input = '') {
    const executionId = uuidv4();
    const startTime = Date.now();

    try {
      let result;
      
      switch (language) {
        case 'javascript':
          result = await this.executeJavaScript(code, input, executionId);
          break;
        case 'python':
          result = await this.executePython(code, input, executionId);
          break;
        case 'java':
          result = await this.executeJava(code, input, executionId);
          break;
        case 'cpp':
          result = await this.executeCpp(code, input, executionId);
          break;
        case 'c':
          result = await this.executeC(code, input, executionId);
          break;
        case 'html':
          result = await this.executeHtml(code);
          break;
        case 'css':
          result = await this.executeCss(code);
          break;
        default:
          throw new Error(`Unsupported language: ${language}`);
      }

      const executionTime = Date.now() - startTime;
      
      return {
        ...result,
        executionTime,
        status: result.error ? 'error' : 'success'
      };
    } catch (error) {
      return {
        output: '',
        error: error.message,
        executionTime: Date.now() - startTime,
        status: 'error'
      };
    }
  }

  async executeJavaScript(code, input, executionId) {
    const fileName = `${executionId}.js`;
    const filePath = path.join(this.tempDir, fileName);

    // Wrap code to handle input
    const wrappedCode = `
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      let inputLines = \`${input}\`.split('\\n').filter(line => line.trim());
      let inputIndex = 0;
      
      // Mock console.log to capture output
      const originalLog = console.log;
      let output = [];
      console.log = (...args) => {
        output.push(args.join(' '));
        originalLog(...args);
      };
      
      // Mock input function
      global.input = () => {
        return inputLines[inputIndex++] || '';
      };
      
      try {
        ${code}
      } catch (error) {
        console.error(error.message);
      }
    `;

    await fs.writeFile(filePath, wrappedCode);

    return new Promise((resolve) => {
      const child = spawn('node', [filePath], {
        timeout: 10000, // 10 second timeout
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        error += data.toString();
      });

      child.on('close', async (code) => {
        try {
          await fs.unlink(filePath);
        } catch {}
        
        resolve({
          output: output.trim(),
          error: error.trim() || null
        });
      });

      child.on('error', async (err) => {
        try {
          await fs.unlink(filePath);
        } catch {}
        
        resolve({
          output: '',
          error: err.message
        });
      });

      // Send input to the process
      if (input) {
        child.stdin.write(input);
      }
      child.stdin.end();
    });
  }

  async executePython(code, input, executionId) {
    const fileName = `${executionId}.py`;
    const filePath = path.join(this.tempDir, fileName);

    await fs.writeFile(filePath, code);

    return new Promise((resolve) => {
      const child = spawn('python3', [filePath], {
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        error += data.toString();
      });

      child.on('close', async (code) => {
        try {
          await fs.unlink(filePath);
        } catch {}
        
        resolve({
          output: output.trim(),
          error: error.trim() || null
        });
      });

      child.on('error', async (err) => {
        try {
          await fs.unlink(filePath);
        } catch {}
        
        resolve({
          output: '',
          error: err.message
        });
      });

      if (input) {
        child.stdin.write(input);
      }
      child.stdin.end();
    });
  }

  async executeJava(code, input, executionId) {
    const className = 'Main';
    const fileName = `${className}.java`;
    const filePath = path.join(this.tempDir, fileName);

    // Wrap code in a Main class if not already present
    const wrappedCode = code.includes('class') ? code : `
      public class Main {
        public static void main(String[] args) {
          ${code}
        }
      }
    `;

    await fs.writeFile(filePath, wrappedCode);

    return new Promise((resolve) => {
      // Compile first
      const compileChild = spawn('javac', [filePath], {
        cwd: this.tempDir,
        timeout: 10000
      });

      compileChild.on('close', (compileCode) => {
        if (compileCode !== 0) {
          resolve({
            output: '',
            error: 'Compilation failed'
          });
          return;
        }

        // Execute
        const runChild = spawn('java', [className], {
          cwd: this.tempDir,
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let error = '';

        runChild.stdout.on('data', (data) => {
          output += data.toString();
        });

        runChild.stderr.on('data', (data) => {
          error += data.toString();
        });

        runChild.on('close', async (runCode) => {
          try {
            await fs.unlink(filePath);
            await fs.unlink(path.join(this.tempDir, `${className}.class`));
          } catch {}
          
          resolve({
            output: output.trim(),
            error: error.trim() || null
          });
        });

        if (input) {
          runChild.stdin.write(input);
        }
        runChild.stdin.end();
      });
    });
  }

  async executeCpp(code, input, executionId) {
    const fileName = `${executionId}.cpp`;
    const execName = `${executionId}`;
    const filePath = path.join(this.tempDir, fileName);
    const execPath = path.join(this.tempDir, execName);

    await fs.writeFile(filePath, code);

    return new Promise((resolve) => {
      // Compile
      const compileChild = spawn('g++', ['-o', execPath, filePath], {
        timeout: 10000
      });

      compileChild.on('close', (compileCode) => {
        if (compileCode !== 0) {
          resolve({
            output: '',
            error: 'Compilation failed'
          });
          return;
        }

        // Execute
        const runChild = spawn(execPath, [], {
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let error = '';

        runChild.stdout.on('data', (data) => {
          output += data.toString();
        });

        runChild.stderr.on('data', (data) => {
          error += data.toString();
        });

        runChild.on('close', async (runCode) => {
          try {
            await fs.unlink(filePath);
            await fs.unlink(execPath);
          } catch {}
          
          resolve({
            output: output.trim(),
            error: error.trim() || null
          });
        });

        if (input) {
          runChild.stdin.write(input);
        }
        runChild.stdin.end();
      });
    });
  }

  async executeC(code, input, executionId) {
    const fileName = `${executionId}.c`;
    const execName = `${executionId}`;
    const filePath = path.join(this.tempDir, fileName);
    const execPath = path.join(this.tempDir, execName);

    await fs.writeFile(filePath, code);

    return new Promise((resolve) => {
      // Compile
      const compileChild = spawn('gcc', ['-o', execPath, filePath], {
        timeout: 10000
      });

      compileChild.on('close', (compileCode) => {
        if (compileCode !== 0) {
          resolve({
            output: '',
            error: 'Compilation failed'
          });
          return;
        }

        // Execute
        const runChild = spawn(execPath, [], {
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let error = '';

        runChild.stdout.on('data', (data) => {
          output += data.toString();
        });

        runChild.stderr.on('data', (data) => {
          error += data.toString();
        });

        runChild.on('close', async (runCode) => {
          try {
            await fs.unlink(filePath);
            await fs.unlink(execPath);
          } catch {}
          
          resolve({
            output: output.trim(),
            error: error.trim() || null
          });
        });

        if (input) {
          runChild.stdin.write(input);
        }
        runChild.stdin.end();
      });
    });
  }

  async executeHtml(code) {
    return {
      output: 'HTML code processed successfully. Open in browser to view.',
      error: null
    };
  }

  async executeCss(code) {
    return {
      output: 'CSS code processed successfully.',
      error: null
    };
  }
}

module.exports = new CodeExecutionService();