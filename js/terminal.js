document.addEventListener("DOMContentLoaded", () => {
  const commandList = document.getElementById("commandLines");
  const promptInput = document.getElementById("promptInput");
  const savedTheme = localStorage.getItem("terminal-theme") || "green";
  document.body.setAttribute("data-theme", savedTheme);

  let commandHistory = []; // Array of {command, timestamp} objects
  let historyIndex = -1;

  let state = {
    user: "guest",
    domain: "ennhila.sh",
    dir: "~",
    advice: "",
    projects: [],
    commands: [["root", "welcome"]],
    completionIndex: 0,
    lastCompletion: '',
    completionMatches: []
  };

  // -----------------------------
  // Utilities
  // -----------------------------
  //

  function scrollToBottom() {
    window.scrollTo(0, document.body.scrollHeight);
  }

  function fetchAdvice() {
    fetch("https://api.adviceslip.com/advice")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch advice");
        return res.json();
      })
      .then((data) => (state.advice = data.slip.advice))
      .catch((err) => {
        console.error("Error fetching advice:", err);
        state.advice = "Unable to fetch advice at this time.";
      });
  }

  function fetchProjects() {
    fetch("https://api.github.com/users/Ennhila/repos?sort=updated&per_page=100")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch projects");
        return res.json();
      })
      .then((repos) => {
        // Filter out forks and sort by stars, then by updated date
        state.projects = repos
          .filter((repo) => !repo.fork && !repo.archived)
          .sort((a, b) => {
            if (b.stargazers_count !== a.stargazers_count) {
              return b.stargazers_count - a.stargazers_count;
            }
            return new Date(b.updated_at) - new Date(a.updated_at);
          })
          .slice(0, 20); // Limit to top 20 projects
      })
      .catch((err) => {
        console.error("Error fetching projects:", err);
        state.projects = [];
      });
  }

  function renderCommandLine(user, cmd, response) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/574485f3-9c01-400c-9556-1b041d9449f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'terminal.js:65',message:'renderCommandLine entry',data:{user,cmd,responseLength:response.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const p = document.createElement("p");
    p.className = "line";

    if (cmd !== "welcome") {
      const sep = document.createElement("p");
      sep.className = "command-sep";
      sep.innerHTML = `
        <span class="user">${user}</span>@<span class="domain">${state.domain}</span><span class="directory">:${state.dir}</span>
        <span class="tick">$</span>
        <span class="command-text">${cmd}</span>
      `;
      p.appendChild(sep);
    }

    if (response.length > 0) {
      const ul = document.createElement("ul");
      // Normalize command to lowercase for CSS class matching
      const cmdNormalized = cmd.toLowerCase();
      ul.className = `command-output ${cmdNormalized}`;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/574485f3-9c01-400c-9556-1b041d9449f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'terminal.js:82',message:'CSS class set',data:{originalCmd:cmd,normalizedCmd:cmdNormalized,cssClass:ul.className},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      response.forEach((item, index) => {
        const liItem = document.createElement("li");
        
        // Special handling for images - don't wrap in <pre>
        if (item.includes('<img')) {
          const imageContainer = document.createElement("div");
          imageContainer.className = "image-container";
          imageContainer.innerHTML = item;
          liItem.appendChild(imageContainer);
        }
        // Special handling for whoami command with live age update
        else if ((cmd === "whoami" || cmd.toLowerCase() === "whoami") && item.includes("Age:")) {
          const pre = document.createElement("pre");
          pre.className = "output-line";
          const ageSpan = document.createElement("span");
          ageSpan.className = "age-display";
          
          // Initial age calculation
          const updateAge = () => {
            const time = (new Date() - new Date("2003-03-26")) / (1000 * 60 * 60 * 24 * 365.25);
            ageSpan.innerHTML = `Age: <i class="purple">${time.toFixed(8)}</i> years old (born March 26, 2003)`;
          };
          
          updateAge();
          pre.appendChild(ageSpan);
          
          // Update age every 50ms
          const ageInterval = setInterval(updateAge, 50);
          
          // Store interval ID on the element for cleanup if needed
          ageSpan.dataset.intervalId = ageInterval;
          liItem.appendChild(pre);
        } else {
          const pre = document.createElement("pre");
          pre.className = "output-line";
          pre.innerHTML = item;
          liItem.appendChild(pre);
        }
        
        ul.appendChild(liItem);
      });

      p.appendChild(ul);
    }

    commandList.appendChild(p);

    scrollToBottom();
  }

  // -----------------------------
  // Command handlers (1:1)
  // -----------------------------

  function getCommandSuggestions(cmd) {
    const availableCommands = [
      "help", "ls", "cat", "clear", "su", "whoami", "motd",
      "email", "credits", "cute", "theme", "Projects"
    ];
    
    const lowerCmd = cmd.toLowerCase();
    const suggestions = [];
    
    // Find commands that start with the typed command
    availableCommands.forEach(availableCmd => {
      if (availableCmd.toLowerCase().startsWith(lowerCmd) && availableCmd.toLowerCase() !== lowerCmd) {
        suggestions.push(availableCmd);
      }
    });
    
    // If no prefix matches, find similar commands (simple Levenshtein-like)
    if (suggestions.length === 0) {
      availableCommands.forEach(availableCmd => {
        const similarity = calculateSimilarity(lowerCmd, availableCmd.toLowerCase());
        if (similarity > 0.5 && availableCmd.toLowerCase() !== lowerCmd) {
          suggestions.push(availableCmd);
        }
      });
    }
    
    return suggestions.slice(0, 3); // Return top 3 suggestions
  }

  function calculateSimilarity(str1, str2) {
    // Simple similarity calculation
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;
    
    // Check if shorter string is contained in longer
    if (longer.includes(shorter)) return 0.7;
    
    // Simple character matching
    let matches = 0;
    for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
      if (str1[i] === str2[i]) matches++;
    }
    return matches / Math.max(str1.length, str2.length);
  }

  function getCompletions(input) {
    const commands = ['help', 'ls', 'cat', 'clear', 'su', 'whoami', 'motd', 'email', 'credits', 'cute', 'theme', 'date', 'history', 'readme'];
    const files = ['whoami.md', 'skills.json', 'contact.md', 'projects', 'pictures', 'music', 'movies', 'tv shows', '.secret'];
    
    const inputLower = input.toLowerCase().trim();
    const parts = inputLower.split(/\s+/);
    const isCompletingFile = parts.length > 1;
    
    if (isCompletingFile) {
      // Completing file name
      const filePrefix = parts[parts.length - 1];
      return files.filter(file => 
        file.toLowerCase().startsWith(filePrefix) && 
        file.toLowerCase() !== filePrefix
      );
    } else {
      // Completing command
      return commands.filter(cmd => 
        cmd.toLowerCase().startsWith(inputLower) && 
        cmd.toLowerCase() !== inputLower
      );
    }
  }

  function handleTabCompletion(e) {
    e.preventDefault();
    const input = promptInput.value;
    const cursorPos = promptInput.selectionStart;
    
    // Get the current word being typed
    const textBeforeCursor = input.substring(0, cursorPos);
    const parts = textBeforeCursor.split(/\s+/);
    const currentWord = parts[parts.length - 1];
    const prefix = parts.slice(0, -1).join(' ');
    
    // Get completions
    const matches = getCompletions(input);
    
    if (matches.length === 0) {
      return; // No completions available
    }
    
    // If we have a stored completion state and it matches, cycle through
    if (state.lastCompletion === input && state.completionMatches.length > 0) {
      state.completionIndex = (state.completionIndex + 1) % state.completionMatches.length;
      const match = state.completionMatches[state.completionIndex];
      
      if (prefix) {
        promptInput.value = prefix + ' ' + match;
      } else {
        promptInput.value = match;
      }
    } else {
      // New completion attempt
      state.completionIndex = 0;
      state.completionMatches = matches;
      state.lastCompletion = input;
      
      const match = matches[0];
      if (prefix) {
        promptInput.value = prefix + ' ' + match;
      } else {
        promptInput.value = match;
      }
    }
    
    // Set cursor to end
    promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
  }

  function run(user, cmd) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/574485f3-9c01-400c-9556-1b041d9449f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'terminal.js:184',message:'run function entry',data:{user,originalCmd:cmd},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (!cmd) return [];

    // Command aliases
    const aliases = {
      'll': 'ls -a',
      'c': 'clear',
      'h': 'help',
      '?': 'help'
    };

    // Normalize command to lowercase for case-insensitive matching
    let cmdLower = cmd.toLowerCase();
    let cmdParts = cmd.split(/\s+/);
    let cmdBase = cmdParts[0].toLowerCase();
    let cmdArgs = cmdParts.slice(1).join(' ');

    // Expand aliases
    if (aliases[cmdBase]) {
      cmd = cmd.replace(cmdBase, aliases[cmdBase]);
      cmdLower = cmd.toLowerCase();
      cmdParts = cmd.split(/\s+/);
      cmdBase = cmdParts[0].toLowerCase();
      cmdArgs = cmdParts.slice(1).join(' ');
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/574485f3-9c01-400c-9556-1b041d9449f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'terminal.js:191',message:'command normalized',data:{originalCmd:cmd,cmdLower,cmdBase,cmdArgs},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    if (cmdLower === "welcome") return welcome(user);
    if (cmdBase === "motd") return motd();
    if (cmdBase === "whoami") return whoami();
    if (cmdBase === "ls" || cmdLower === "ls -a" || cmdLower === "ls-a") {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/574485f3-9c01-400c-9556-1b041d9449f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'terminal.js:196',message:'ls command matched',data:{originalCmd:cmd,cmdBase,passingToLs:cmd},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return ls(cmd);
    }
    if (cmdBase === "clear") return clear();
    if (cmdBase === "cat") return cat(cmd);
    if (cmdBase === "su") return su(cmd);
    if (cmdBase === "help") return help();
    if (cmdBase === "email") return email();
    if (cmdBase === "credits") return credits();
    if (cmdBase === "cute") return cute();
    if (cmdBase === "theme") return theme(cmd);
    if (cmdBase === "date") return date();
    if (cmdBase === "history") return history();
    if (cmdBase === "readme") return readme();

    // Better error message for unknown commands
    const suggestions = getCommandSuggestions(cmd);
    const errorMsg = [
      `<i class="error">command not found: ${cmd}</i>`,
    ];
    
    if (suggestions.length > 0) {
      errorMsg.push(`<i class="grey">Did you mean:</i>`);
      suggestions.forEach(suggestion => {
        errorMsg.push(`  <i class="teal">${suggestion}</i>`);
      });
    } else {
      errorMsg.push(`<i class="grey">Type <i class="teal">help</i> to see available commands.</i>`);
    }
    
    return errorMsg;
  }

  function welcome(user) {
    if (user !== "root") return [];

    const date = new Date().toLocaleString("en-US", { timeZoneName: "short" });

    return [
      '<i class="typewriter" style="font-size:25px"><span>/ennhila.com</span></i>',
      `<i class="grey">Last login: ${date} on ttys002</i>`,
      " ",
      `Welcome to my humble abode, <i class="user">${state.user}</i>, I'm <i class="pink" style="font-size:19px">Ilyass</i>.`,
      '<pre><a href="https://twitter.com/EnnIlyass" target="_blank">Twitter</a> | <a href="https://github.com/Ennhila" target="_blank">Github</a> | <a href="https://www.linkedin.com/in/ilyass-ennhila-413403388/" target="_blank">LinkedIn</a></pre>',
      " ",
      '<i class="yellow">💡 New to terminal/Linux commands?</i>',
      '<i class="grey">Don\'t worry! Type <i class="teal">readme</i> for a complete guide on how to use this website.</i>',
      " ",
      '<i class="grey">Btw there´s a hidden file here..., you can try to find it ;)</i>',
      'Type <i class="teal">`help`, `h` or `?`</i> to get a list of commands',
      'Type <i class="teal">`theme`</i> to change the theme of the terminal, For example: <i class="teal">`theme white`</i>',
      '<i class="grey">and dont forget to use the <i class="teal">tab</i> key to autocomplete commands and file names!</i>',
    ];
  }

  function motd() {
    fetchAdvice();
    return [state.advice];
  }

  function whoami() {
    const calculateAge = () => {
      const time = (new Date() - new Date("2003-03-26")) / (1000 * 60 * 60 * 24 * 365.25);
      return time.toFixed(8); // Show 8 decimal places for precision
    };

    return [
      "Hi, I'm Ilyass Ennhila.",
      `Age: <i class="purple">${calculateAge()}</i> years old (born March 26, 2003)`,
      "A passionate web developer and tech enthusiast.",
      "I love creating beautiful and functional web experiences.",
      " ",
      "You can learn more about me by typing:",
      "  <i class='teal'>cat whoami.md</i> - More detailed info",
      "  <i class='teal'>cat contact.md</i> - Contact information",
      "  <i class='teal'>cat skills.json</i> - My skills",
    ];
  }

  function ls(cmd) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/574485f3-9c01-400c-9556-1b041d9449f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'terminal.js:265',message:'ls function entry',data:{receivedCmd:cmd},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    const cmdLower = cmd.toLowerCase();
    if (cmdLower.includes("-a")) {
      // For ls -a: 4 items per row
      const items = ['portfolio.md', 'skills.json', 'contact.md', 'projects', '<i class="yellow">.secret</i>'];
      const result = formatLsOutput(items);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/574485f3-9c01-400c-9556-1b041d9449f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'terminal.js:270',message:'ls -a result',data:{resultLength:result.length,firstRow:result[0]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return result;
    } else {
      // For ls: 4 items per row
      const items = ['whoami.md', 'skills.json', 'projects', 'contact.md', 'pictures', 'music', 'movies', 'tv shows', 'books', 'cv.pdf'];
      const result = formatLsOutput(items);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/574485f3-9c01-400c-9556-1b041d9449f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'terminal.js:274',message:'ls result',data:{resultLength:result.length,firstRow:result[0]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return result;
    }
  }

  function formatLsOutput(items) {
    // Return items as individual array elements so CSS Grid can handle layout
    // Each item will be rendered as a separate <li> element in a 4-column grid
    return items;
  }

  function cat(cmd) {
    // Make file name matching case-insensitive
    const cmdLower = cmd.toLowerCase();
    
    if (cmdLower.includes("skills.json")) {
      return [
        "{",
        ` "skills": {`,
        `    <i class="purple">"FrontEnd"</i>: [<i class="blue">"javascript"</i>, <i class="blue">"learning react"</i>],`,
        `    <i class="purple">"BackEnd"</i>: [<i class="blue">"node"</i>, <i class="blue">"express"</i>, <i class="blue">"php"</i>, <i class="blue">"JAVA"</i>],`,
        `    <i class="purple">"Database"</i>: [<i class="blue">"mysql"</i>, <i class="blue">"mongodb"</i>],`,
        `    <i class="purple">"Design"</i>: [<i class="blue">"figma"</i>],`,
        `  }`,
        "}",
      ];
    }
    if (cmdLower.includes("whoami.md")) {
        return [
            "Who I Am?",
            "I'm Ilyass Ennhila, 22 years old.",
            "I’m a tech-focused entrepreneur and developer in training who enjoys turning real-life problems into practical digital solutions.",
            "I currently run a student transportation company, where I’ve gained strong experience in organization, responsibility, and user-focused services.",
            " ",
            "I’m studying web and software development, with a strong interest in Java, databases, and application architecture.",
            "I like working on projects that mix technology with real business needs, such as tracking systems, management tools, and mobile or web apps.",
            "I’m driven by learning, building, and improving. Whether it’s optimizing a system, designing a new app, or planning a future startup, I’m always focused on creating something useful, professional, and impactful.",
          
            "  <i class='teal'>cat projects</i> - My projects",
            "  <i class='teal'>cat contact.md</i> - My contact information",
        ];
    }
    if (cmdLower.includes("contact.md")) {
      return [
        "Feel free to reach out to me via email or social media:",
        "- Email: <i class='purple'>ennhila78</i> {at} <i class='purple'>gmail</i> {dot} <i class='purple'>com</i>",
        "- LinkedIn: <a href='https://www.linkedin.com/in/ilyass-ennhila-413403388/' target='_blank'>Ilyass Ennhila</a>",
        "- Twitter: <a href='https://twitter.com/EnnIlyass' target='_blank'>@EnnIlyass</a>",
        "- GitHub: <a href='https://github.com/Ennhila' target='_blank'>@Ennhila</a>",
      ];
    }
    if (cmdLower.includes("projects")) {
      return displayProjects();
    }
    if (cmdLower.includes("music")) {
        return ["My playlist is under construction. Stay tuned!"];
    }
    if (cmdLower.includes("movies")) {
        return ["My movies collection is under construction. Stay tuned!"];
    }
    if (cmdLower.includes("tv shows") || cmdLower.includes("tvshows")) {
        return ["My TV shows collection is under construction. Stay tuned!"];
    }
    if (cmdLower.includes("pictures")) {
        return ["I love photography! My favorite subjects are nature and urban landscapes, but im to lazy to share them :D"];
    }
    if (cmdLower.includes("books")) {
        return ["My books collection is under construction. Stay tuned!"];
    }
    if (cmdLower.includes("cv.pdf")) {
        return [
          ` <i class='teal'>Awesome!</i> `,
          `- Your download will start automatically. If it doesn't, <a href='https://drive.google.com/' target='_blank'><i class='green'>click here.</i></a>`
        ];
    }
    if (cmdLower.includes(".secret") || cmdLower.includes("secret")) {
      if (state.user !== "guest") {
        return [
          '<img src="https://media.tenor.com/5lQMLeZ_6UsAAAAM/please-hire-me-heavy-tf2.gif" alt="Secret meme" style="max-width:100%; height:auto; border-radius:8px; margin:1rem 0;" />',
          '<i class="grey">and you’re curious. I like that..</i>',
        ];
      }
      return [
        '<i class="error">cat: .secret: Permission denied</i>',
        'Type `<i class="yellow">su</i> USERNAME`',
      ];
    }

    return [`${cmd}: No such file or directory`];
  }

  function displayProjects() {
    if (state.projects.length === 0) {
      return [
        "Loading projects from GitHub...",
        "If this message persists, there may be an issue fetching your repositories.",
      ];
    }

    const output = [
      "<i class='purple'>My GitHub Projects:</i>",
      "<i class='yellow' style='font-size:0.9em'>Btw my big projects are private repositories, so you can't view them here.</i>",
      "<i class='grey'>Click on the project name to view the repository on GitHub</i>",
      " ",
    ];

    state.projects.forEach((repo, index) => {
      const stars = repo.stargazers_count > 0 
        ? ` <i class='yellow'>★ ${repo.stargazers_count}</i>` 
        : "";
      const language = repo.language 
        ? ` <i class='blue'>[${repo.language}]</i>` 
        : "";
      const description = repo.description 
        ? ` - ${repo.description}` 
        : "";
      
      output.push(
        `${index + 1}. <a href='${repo.html_url}' target='_blank'><i class='teal'>${repo.name}</i></a>${stars}${language}${description}`
      );
    });

    output.push(" ");
    output.push(`<i class='grey'>Total: ${state.projects.length} projects</i>`);
    output.push(`<i class='grey'>View all: <a href='https://github.com/Ennhila?tab=repositories' target='_blank'>github.com/Ennhila</a></i>`);

    return output;
  }

  function su(cmd) {
    const cmdLower = cmd.toLowerCase();
    if (cmdLower === "su" || cmdLower.includes("root")) {
      return [
        "su: Authentication failed. root is disabled.",
        "Log in with your personal username.",
      ];
    }

    // Case-insensitive: extract username after "su" command
    const user = cmd.replace(/^su\s+/i, "");
    state.user = user;
    updatePrompt();
    return [`logged in as <i class="user">${user}</i>.`];
  }

  function clear() {
    commandList.innerHTML = "";
    return [];
  }

  function help() {
    return [
      "Use the commands below:",
      "<i class='yellow'>ls</i> — list files",
      "<i class='yellow'>whoami</i> — show information about me ;)",
      "<i class='yellow'>cat</i> FILE — view file",
      "<i class='yellow'>su</i> USERNAME — login",
      "<i class='yellow'>clear</i> — clear screen",
      "<i class='yellow'>email</i> — contact",
      "<i class='yellow'>date</i> — show current date and time",
      "<i class='yellow'>history</i> — show command history",
      "<i class='yellow'>readme</i> — show documentation",
      " ",
      "<i class='grey'>Aliases:</i>",
      "  <i class='teal'>ll</i> = ls -a",
      "  <i class='teal'>c</i> = clear",
      "  <i class='teal'>h</i> or <i class='teal'>?</i> = help",
    ];
  }

  function email() {
    return [
      '<i class="purple">ennhila78</i> {at} <i class="purple">gmail</i> {dot} com',
    ];
  }

  function date() {
    const now = new Date();
    const formatted = now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
    return [formatted];
  }

  function history() {
    if (commandHistory.length === 0) {
      return ['No command history'];
    }
    
    const recentHistory = commandHistory.slice(-20);
    const startNum = Math.max(1, commandHistory.length - 19);
    
    const entries = recentHistory.map((entry, index) => {
      const num = startNum + index;
      const time = entry.timestamp.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      return `  ${num}  [${time}]  ${entry.command}`;
    });
    
    return entries;
  }

  function readme() {
    return [
      "<i class='purple' style='font-size:1.2em'>╔═══════════════════════════════════════════════════════════╗</i>",
      "<i class='purple' style='font-size:1.2em'>║               TERMINAL WEBSITE README                ║</i>",
      "<i class='purple' style='font-size:1.2em'>╚═══════════════════════════════════════════════════════════╝</i>",
      " ",
      "<i class='yellow' style='font-size:1.1em'>📖 What is this website?</i>",
      " ",
      "This is my personal terminal-style website, a creative way to showcase",
      "my portfolio, skills, and projects through an interactive command-line",
      "interface. Instead of a traditional website, you navigate using Unix-like",
      "commands in a terminal emulator.",
      " ",
      "<i class='yellow' style='font-size:1.1em'>🚀 How to use it</i>",
      " ",
      "• Type commands in the prompt and press <i class='teal'>Enter</i> to execute them",
      "• Use <i class='teal'>Tab</i> for auto-completion (commands and file names)",
      "• Press <i class='teal'>↑</i> and <i class='teal'>↓</i> arrows to navigate command history",
      "• Type <i class='teal'>help</i> or <i class='teal'>h</i> to see available commands",
      "• Type <i class='teal'>clear</i> or <i class='teal'>c</i> to clear the terminal",
      "• Commands are case-insensitive (LS, ls, Ls all work)",
      " ",
      "<i class='yellow' style='font-size:1.1em'>📋 Available Commands</i>",
      " ",
      "<i class='blue'>Navigation & Files:</i>",
      "  <i class='teal'>ls</i>          - List files and directories",
      "  <i class='teal'>ls -a</i>      - List all files (including hidden)",
      "  <i class='teal'>cat FILE</i>   - View contents of a file",
      " ",
      "<i class='blue'>Information:</i>",
      "  <i class='teal'>whoami</i>     - Show information about me",
      "  <i class='teal'>help</i>       - Display help message",
      "  <i class='teal'>readme</i>     - Show this documentation",
      "  <i class='teal'>date</i>       - Display current date and time",
      "  <i class='teal'>history</i>    - Show command history with timestamps",
      " ",
      "<i class='blue'>Interaction:</i>",
      "  <i class='teal'>su USERNAME</i> - Login as a user (unlocks hidden content)",
      "  <i class='teal'>email</i>      - Show contact email",
      "  <i class='teal'>motd</i>       - Get a random piece of advice",
      " ",
      "<i class='blue'>Customization:</i>",
      "  <i class='teal'>theme NAME</i> - Change terminal theme (green, white, amber)",
      " ",
      "<i class='blue'>Utilities:</i>",
      "  <i class='teal'>clear</i>      - Clear the terminal screen",
      " ",
      "<i class='yellow' style='font-size:1.1em'>⚡ Command Aliases</i>",
      " ",
      "  <i class='teal'>ll</i> = ls -a",
      "  <i class='teal'>c</i> = clear",
      "  <i class='teal'>h</i> or <i class='teal'>?</i> = help",
      " ",
      "<i class='yellow' style='font-size:1.1em'>🎮 Hidden Features & Easter Eggs</i>",
      " ",
      "<i class='grey'>• There's a hidden file in the directory... can you find it? 👀</i>",
      "<i class='grey'>• Try logging in with <i class='teal'>su</i> to unlock special content</i>",
      "<i class='grey'>• Some commands have special outputs when used in certain ways</i>",
      "<i class='grey'>• Check out the <i class='teal'>Projects</i> file to see my GitHub repos</i>",
      "<i class='grey'>• The <i class='teal'>whoami</i> command shows my age updating in real-time!</i>",
      "<i class='grey'>• Explore different files with <i class='teal'>cat</i> - each has unique content</i>",
      "<i class='grey'>• Try typing <i class='teal'>credits</i> or <i class='teal'>cute</i> for some fun</i>",
      " ",
      "<i class='purple'>💡 Tip: Use Tab completion to speed up your navigation!</i>",
      " ",
      "<i class='yellow' style='font-size:1.1em'>Scroll Up so you can read the whole documentation!</i>",
    ];
  }

  // -----------------------------
  // Prompt handling (Prompt.vue)
  // -----------------------------

  function updatePrompt() {
    document.getElementById("promptUser").textContent = state.user;
    document.getElementById("promptDomain").textContent = state.domain;
    document.getElementById("promptDir").textContent = `:${state.dir}`;
  }

  // Removed promptMirror - not used in current implementation

  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const cmd = promptInput.value.trim();

      // Command validation
      if (!cmd || cmd.length === 0) {
        // Don't render anything for empty commands, just clear and refocus
        promptInput.value = "";
        promptInput.focus();
        return;
      }

      // Validate command format (basic checks)
      if (cmd.length > 200) {
        const errorResponse = [
          '<i class="error">Error: Command too long (max 200 characters)</i>',
          '<i class="grey">Please use a shorter command.</i>'
        ];
        renderCommandLine(state.user, cmd, errorResponse);
        promptInput.value = "";
        promptInput.focus();
        return;
      }

      commandHistory.push({ command: cmd, timestamp: new Date() });
      historyIndex = commandHistory.length;

      promptInput.value = "";
      const response = run(state.user, cmd);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/574485f3-9c01-400c-9556-1b041d9449f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'terminal.js:483',message:'calling renderCommandLine',data:{user:state.user,cmd,responseLength:response.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      renderCommandLine(state.user, cmd, response);
      promptInput.focus();
    }
    // TAB - Tab completion
    if (e.key === "Tab") {
      handleTabCompletion(e);
    }

    // ESCAPE - Reset completion state
    if (e.key === "Escape") {
      state.completionIndex = 0;
      state.lastCompletion = '';
      state.completionMatches = [];
    }

    // UP ARROW
    if (e.key === "ArrowUp") {
      if (commandHistory.length === 0) return;

      e.preventDefault();
      historyIndex = Math.max(0, historyIndex - 1);
      promptInput.value = commandHistory[historyIndex].command;
    }

    // DOWN ARROW
    if (e.key === "ArrowDown") {
      if (commandHistory.length === 0) return;

      e.preventDefault();
      historyIndex = Math.min(commandHistory.length, historyIndex + 1);
      promptInput.value = commandHistory[historyIndex] ? commandHistory[historyIndex].command : "";
    }
  });

  // -----------------------------
  // Boot
  // -----------------------------

  function initializeTerminal() {
    updatePrompt();
    fetchAdvice();
    fetchProjects();
    promptInput.focus();

    // Initial welcome
    renderCommandLine("root", "welcome", welcome("root"));
  }

  // theme cmd
  function theme(cmd) {
    // Case-insensitive: extract theme name after "theme" command
    const selected = cmd.replace(/^theme\s+/i, "").toLowerCase();
    const themes = ["green", "white", "amber"];

    if (!themes.includes(selected)) {
      return [
        `theme: '${selected}' not found`,
        `available themes: ${themes.join(", ")}`,
      ];
    }

    document.body.setAttribute("data-theme", selected);
    localStorage.setItem("terminal-theme", selected);

    return [`theme set to ${selected}`];
  }

  // -----------------------------
  // Intro Animation
  // -----------------------------

  let header = document.querySelector('#intro');
  let anim = [
    { t: "{ }", ms: 200 },
    { t: "{_}", ms: 200 },
    { t: "{ }", ms: 200 },
    { t: "{_}", ms: 200 },
    { t: "{E_}", ms: 100 },
    { t: "{EN_}", ms: 100 },
    { t: "{ENN_}", ms: 100 },
    { t: "{ENNH_}", ms: 100 },
    { t: "{ENNHI_}", ms: 100 },
    { t: "{ENNHIL_}", ms: 100 },
    { t: "{ENNHILA_}", ms: 100 },
    { t: "{ENNHILA}", ms: 100 },
    { t: "{ENNHILA}", ms: 100 }
  ];
  let stepDenominator = 1;
  if (window.localStorage.stepDenominator)
    stepDenominator = window.localStorage.stepDenominator;
  let i = 0;
  let update = () => {
    let step = anim[i];
    header.innerText = step.t;
    i++;

    if (i < anim.length)
      setTimeout(update, step.ms / stepDenominator);
    else {
      header.classList.add('top');
      setTimeout(() => {
        document.getElementById('main').style.opacity = 1;
        if (typeof initGlobe === 'function') {
          initGlobe();
        }
        // Initialize terminal after intro
        initializeTerminal();
      }, 500);
      window.localStorage.stepDenominator = 2;
    }
  };
  
  // Start intro animation
  update();
});
