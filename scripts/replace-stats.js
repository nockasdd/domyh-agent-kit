const fs = require('fs');
const path = require('path');

function replaceFileContent(filePath, replaceFn) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[!] File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  const orgLength = content.length;
  content = replaceFn(content);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[✓] Updated ${filePath} (Delta: ${content.length - orgLength} bytes)`);
}

// 1. AWF READMEs
const readmes = ['README.md', 'README_VN.md'];
for (const file of readmes) {
  replaceFileContent(path.join('e:/Deverloper/NewDeverloper/auto_domyh/domyh-awesome-code-agent/domyh-awf', file), content => {
    let c = content;
    c = c.replace(/103\+Skills\+•\+26\+IDEs\+•\+44\+Commands/g, '104+Skills+•+26+IDEs+•+45+Commands');
    c = c.replace(/skills-103-8B5CF6/g, 'skills-104-8B5CF6');
    c = c.replace(/commands-44-F59E0B/g, 'commands-45-F59E0B');
    c = c.replace(/All 44 Commands/g, 'All 45 Commands');
    c = c.replace(/Tất cả 44 Commands/g, 'Tất cả 45 Commands');
    c = c.replace(/Skills \(103 total\)/g, 'Skills (104 total)');
    c = c.replace(/Skills \(103 tổng\)/g, 'Skills (104 tổng)');
    c = c.replace(/103\+Total\+Skills/g, '104+Total+Skills');
    c = c.replace(/103\+Tổng\+Skills/g, '104+Tổng+Skills');
    c = c.replace(/26\+Cross-cutting/g, '27+Cross-cutting');
    c = c.replace(/Cross-cutting\s*\(\s*26\s*\)/g, 'Cross-cutting (27)');
    c = c.replace(/cross-cutting\s*\(\s*26\s*\)/g, 'cross-cutting (27)');
    c = c.replace(/cross-cutting\/\s*\(\s*26\s*\)/g, 'cross-cutting/ (27)');
    c = c.replace(/\(35\)/g, '(36)');
    c = c.replace(/\*\*103\*\*/g, '**104**');
    c = c.replace(/103 specialized skills/g, '104 specialized skills');
    c = c.replace(/103 skills chuyên biệt/g, '104 skills chuyên biệt');
    c = c.replace(/workflows\/\s*\(\s*44\)/g, 'workflows/     (45)');
    c = c.replace(/44 command handlers/g, '45 command handlers');
    c = c.replace(/Receiving Code Review<\/sub>/g, 'Receiving Code Review, Game Development</sub>');
    c = c.replace(/Receiving Code Review \|/g, 'Receiving Code Review, Game Development |');
    c = c.replace(/### 🎯 Special \(9 commands\)/g, '### 🎯 Special (10 commands)');
    c = c.replace(/### 🎯 Đặc biệt \(9 commands\)/g, '### 🎯 Đặc biệt (10 commands)');
    
    // Add command to table
    const isVn = file.includes('_VN');
    const cmdLine = isVn ? 
      `| \`/game\`         | Trợ lý phát triển game toàn diện (Unity/UE/HTML5)                     | \`/game Tạo script di chuyển player 2D\`    |` :
      `| \`/game\`         | Comprehensive game development assistant (Unity/UE/HTML5/Godot)       | \`/game Create 2D player movement script\`                       |`;
    c = c.replace(/\| `\/lang`/g, `${cmdLine}\n| \`/lang\``);
    
    return c;
  });
}

// 2. nock-cli README
replaceFileContent('e:/Deverloper/NewDeverloper/auto_domyh/domyh-awesome-code-agent/nock-cli/README.md', c => {
  let text = c;
  text = text.replace(/103\+Skills\+•\+26\+IDEs\+•\+44\+Commands/g, '104+Skills+•+26+IDEs+•+45+Commands');
  return text;
});

// 3. index.html Landing page
replaceFileContent('e:/Deverloper/NewDeverloper/auto_domyh/domyh-awesome-code-agent/domyh-awf/docs/index.html', c => {
  let text = c;
  text = text.replace(/103\+ Skills/g, '104+ Skills');
  text = text.replace(/44\+ Commands/g, '45+ Commands');
  text = text.replace(/1\.7\.7/g, '1.7.8');
  text = text.replace(/6\.6\.9/g, '6.7.0');
  text = text.replace(/103 Skills/g, '104 Skills');
  text = text.replace(/44 Workflows/g, '45 Workflows');
  text = text.replace(/103 Tools/g, '104 Tools'); // or something
  return text;
});

// 4. doc codex-setup.md, HSA_ENGINE.md
replaceFileContent('e:/Deverloper/NewDeverloper/auto_domyh/domyh-awesome-code-agent/domyh-awf/readme/codex-setup.md', c => {
  return c.replace(/1\.7\.7/g, '1.7.8');
});
replaceFileContent('e:/Deverloper/NewDeverloper/auto_domyh/domyh-awesome-code-agent/domyh-awf/readme/HSA_ENGINE.md', c => {
  return c.replace(/1\.7\.7/g, '1.7.8');
});

// 5. HSA README
replaceFileContent('e:/Deverloper/NewDeverloper/auto_domyh/domyh-awesome-code-agent/domyh-hsa-mcp/README.md', c => {
  let text = c;
  text = text.replace(/1\.7\.7/g, '1.7.8');
  return text;
});

console.log("Done updates");
