const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the root directory
app.use(express.static('.'));

// GitHub Repo API
const repoApi = "https://api.github.com/repos/hotpad100c/Qoute/contents/";
let imageCache = [];
const cacheDuration = 10 * 60 * 1000; 
const githubToken = process.env.GITHUB_TOKEN;
const cacheFile = './cache.json';

// Levenshtein
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1);
    }
  }
  return dp[a.length][b.length];
}

function similarity(a, b) {
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// Fetch GitHub images
async function fetchAllImages() {
  console.log("Fetching images from GitHub API...");
  console.log("GitHub Token prefix:", githubToken?.slice(0, 5));
  let page = 1;
  let allImages = [];
  const headers = {
    'User-Agent': 'MyQuoteApp/1.0',   
  };

  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }
  
    try {
      const response = await axios.get(
        "https://api.github.com/repos/hotpad100c/Qoute/git/trees/main?recursive=1",
        { headers }
      );

      const files = response.data.tree
      .filter(item => item.type === "blob" && /\.(png|jpg|jpeg|gif)$/i.test(item.path))
      .map(item => ({
        name: item.path.split('/').pop(),
        url: `https://raw.githubusercontent.com/hotpad100c/Qoute/main/${item.path}`
      }));

      console.log(`Fetched ${files.length} images.`);
      return files;
    }  catch (err) {
      console.error("Error fetching from GitHub API:", err.response?.status, err.response?.data);
    }

  console.log(`Fetched ${allImages.length} images.`);
  return allImages;
}

// Refresh cache with retry + persistence
async function refreshCache(retries = 3) {
  let images = [];
  for (let i = 0; i < retries; i++) {
    images = await fetchAllImages();
    if (images.length > 0) break;
    console.log(`Retrying fetch... (${i + 1}/${retries})`);
    await new Promise(r => setTimeout(r, 5000)); // wait 5s before retry
  }

  if (images.length > 0) {
    imageCache = images;
    fs.writeFileSync(cacheFile, JSON.stringify(images, null, 2));
    console.log(`Cache refreshed: ${images.length} images.`);
  } else {
    console.log("⚠️ Fetch failed, keeping old cache.");
  }
}

// Load cache from file if exists 
function loadCacheFromFile() {
  if (fs.existsSync(cacheFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        imageCache = data;
        console.log(`Loaded ${data.length} images from cache.json`);
      }
    } catch (err) {
      console.error("Error reading cache file:", err.message);
    }
  }
}

// Init cache
loadCacheFromFile();
refreshCache();
setInterval(refreshCache, cacheDuration);

// API: get all images
app.get('/api/images', (req, res) => {
  if (imageCache.length === 0) return res.status(503).json({ error: 'Cache not ready' });
  res.json(imageCache);
});

// API: search image
app.get('/api/search', (req, res) => {
  const { keyword } = req.query;
  if (!keyword) return res.status(400).json({ error: 'Keyword is required' });
  if (imageCache.length === 0) return res.status(503).json({ error: 'Cache not ready' });

  let containsResults = [];
  let fuzzyResults = [];

  imageCache.forEach(img => {
    if (img.name.toLowerCase().includes(keyword.toLowerCase())) containsResults.push({ ...img, score: 1 });
    else {
      const score = similarity(keyword, img.name);
      if (score > 0.3) fuzzyResults.push({ ...img, score });
    }
  });

  let results = containsResults.length > 0 ? containsResults : fuzzyResults;
  results.sort((a, b) => b.score - a.score);
  res.json(results.slice(0, 3));
});
// API:total count
app.get('/api/count', (req, res) => {
  if (imageCache.length === 0) {
    return res.status(503).json({ error: 'Cache not ready' });
  }
  res.json({ total: imageCache.length });
});
// API: random image
app.get('/api/random', (req, res) => {
  if (imageCache.length === 0) return res.status(503).json({ error: 'Cache not ready' });
  const count = parseInt(req.query.count, 10) || 6;
  const shuffled = [...imageCache].sort(() => 0.5 - Math.random());
  res.json(shuffled.slice(0, count));
});

// Run server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
