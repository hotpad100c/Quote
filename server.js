const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;

// Serve static files from the root directory
app.use(express.static('.'));

const repoApi = "https://api.github.com/repos/hotpad100c/Qoute/contents/";
let imageCache = [];
let lastFetched = 0;
const cacheDuration = 5 * 60 * 1000; // 5 minutes

async function fetchAllImages() {
    console.log("Fetching images from GitHub API...");
    let page = 1;
    let allImages = [];
    while (true) {
        try {
            // We can't fetch the subdirectory directly, so we need to fetch the root and then filter.
            // The API does not support recursive fetching for contents.
            // A better approach for larger repos would be to use the Git Trees API with recursive=1
            const response = await axios.get(`${repoApi}?page=${page}&per_page=100`);
            if (response.data.length === 0) {
                break;
            }
            const files = response.data
                .filter(item => item.type === "file" && /\.(png|jpg|jpeg|gif)$/i.test(item.name))
                .map(item => ({
                    name: item.name,
                    url: item.download_url
                }));

            allImages = allImages.concat(files);

            // Also check 'Some interesting quotes/' directory
            // This is getting complicated. For now, I will just fetch the root.
            // The user can improve this later if needed.

            page++;
        } catch (error) {
            console.error("Error fetching from GitHub API:", error.message);
            // Return what we have so far
            return allImages;
        }
    }

    // The above loop only gets the root directory. Let's also get the subdirectory.
    try {
        const response = await axios.get(`${repoApi}/Some interesting quotes`);
        if (response.data) {
            const subdir_images = response.data
                .filter(item => item.type === "file" && /\.(png|jpg|jpeg|gif)$/i.test(item.name))
                .map(item => ({
                    name: item.name,
                    url: item.download_url
                }));
            allImages = allImages.concat(subdir_images);
        }
    } catch (error) {
        console.error("Error fetching subdirectory from GitHub API:", error.message);
    }


    return allImages;
}


async function getImages() {
    const now = Date.now();
    if (now - lastFetched > cacheDuration || imageCache.length === 0) {
        imageCache = await fetchAllImages();
        lastFetched = now;
        console.log(`Cached ${imageCache.length} images.`);
    }
    return imageCache;
}

// Levenshtein distance function
function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + 1
                );
            }
        }
    }
    return dp[a.length][b.length];
}

function similarity(a, b) {
    const dist = levenshtein(a, b);
    return 1 - dist / Math.max(a.length, b.length);
}

app.get('/api/images', async (req, res) => {
    const images = await getImages();
    res.json(images);
});

app.get('/api/search', async (req, res) => {
    const { keyword } = req.query;
    if (!keyword) {
        return res.status(400).json({ error: 'Keyword is required' });
    }

    const images = await getImages();

    let containsResults = [];
    let fuzzyResults = [];

    images.forEach(img => {
        if (img.name.toLowerCase().includes(keyword.toLowerCase())) {
            containsResults.push({ ...img, score: 1 });
        } else {
            const score = similarity(keyword, img.name);
            if (score > 0.3) { // Use a threshold for fuzzy search
                fuzzyResults.push({ ...img, score });
            }
        }
    });

    let results = containsResults.length > 0 ? containsResults : fuzzyResults;
    results.sort((a, b) => b.score - a.score);
    const top3 = results.slice(0, 3);

    res.json(top3);
});

app.get('/api/random', async (req, res) => {
    const images = await getImages();
    const shuffled = [...images].sort(() => 0.5 - Math.random());
    const count = parseInt(req.query.count, 10) || 6;
    res.json(shuffled.slice(0, count));
});


app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    // Initial fetch
    getImages();
});
