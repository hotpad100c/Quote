const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the root directory
app.use(express.static('.'));

// GitHub Repo API
const repoApi = "https://api.github.com/repos/hotpad100c/Qoute/contents/";
let imageCache = [];
const cacheDuration = 5 * 60 * 1000; //refresh every 10 minutes
const githubToken = process.env.GITHUB_TOKEN;

// Levenshtein idk chatgpt write this 
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

// fetch images
async function fetchAllImages() {
  console.log("Fetching images from GitHub API...");
  let page = 1;
  let allImages = [];
  const headers = githubToken ? { Authorization: `token ${githubToken}` } : {};

  while (true) {
    try {
      const response = await axios.get(`${repoApi}?page=${page}&per_page=100`, { headers });
      if (!response.data || response.data.length === 0) break;

      const files = response.data
        .filter(item => item.type === "file" && /\.(png|jpg|jpeg|gif)$/i.test(item.name))
        .map(item => ({ name: item.name, url: item.download_url }));

      allImages = allImages.concat(files);
      page++;
    } catch (err) {
      console.error("Error fetching from GitHub API:", err.message);
      break;
    }
  }

  console.log(`Fetched ${allImages.length} images.`);
  return allImages;
}

// chache
async function refreshCache() {
  imageCache = await fetchAllImages();
}
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
