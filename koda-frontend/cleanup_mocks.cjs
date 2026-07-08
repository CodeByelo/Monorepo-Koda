const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

const dir = path.join(__dirname, 'src', 'pages');

walkDir(dir, function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    let regex = /(const\s+\w+\s*=\s*[\w\?\.]+\s*\|\|\s*\[)([\s\S]*?)(\];)/g;
    
    content = content.replace(regex, (match, p1, p2, p3) => {
        if (p2.includes('{')) {
            console.log(`Replaced mock array in ${filePath}`);
            return `${p1}${p3}`; 
        }
        return match;
    });

    let regexSingle = /(\|\|\s*\[\s*\{[^\]]*\}\s*\])/g;
    content = content.replace(regexSingle, (match) => {
        console.log(`Replaced single line mock in ${filePath}`);
        return '|| []';
    });

    if (original !== content) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
});
