const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.static('public'));

// Zajištění správného naslouchání pouze na jednom portu
app.listen(4532, () => {
    console.log('Server běží na https://inizio-test.onrender.com:4532/');
});

app.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || /^[^\w\s]+$/.test(query)) {
            return res.status(400).send('Chybí platný vyhledávací dotaz');
        }

        // Funkce pro spuštění Puppeteeru
        async function startBrowser() {
            let browser;
            try {
                console.log("Opening the browser......");
                browser = await puppeteer.launch({
                    headless: true,
                    ignoreDefaultArgs: ["--disable-extensions"],
                    args: [
                        "--no-sandbox",
                        "--use-gl=egl",
                        "--disable-setuid-sandbox",
                    ],
                    ignoreHTTPSErrors: true,
                });
            } catch (err) {
                console.log("Could not create a browser instance => : ", err);
            }
            return browser;
        }

        const browser = await startBrowser();
        const page = await browser.newPage();

        // Nastavení User-Agent až po vytvoření nové stránky
        await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36");

        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=cs`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });

        const results = await page.evaluate(() => {
            const items = [];
            const seenUrls = new Set();
            const elements = document.querySelectorAll('div.g'); // Celý div pro každou položku

            elements.forEach((element) => {
                const titleElement = element.querySelector('h3');
                const linkElement = element.querySelector('a');
                const snippetElement = element.querySelector('div.VwiC3b'); // Snippet

                const title = titleElement ? titleElement.innerText : null;
                const link = linkElement ? linkElement.href : null;
                const snippet = snippetElement ? snippetElement.innerText : null;

                // Ověření, zda URL již bylo přidáno
                if (link && !seenUrls.has(link) && title && snippet) {
                    seenUrls.add(link);
                    items.push({ title, link, snippet });
                }
            });
            return items;
        });

        await browser.close();

        // Uložení výsledků do souboru s UTF-8 kódováním
        const bom = '\uFEFF'; // Přidání BOM pro UTF-8
        const csvContent = bom + "TITLE;URL;SNIPPET\n" + results.map(e => 
            `${e.title.replace(/;/g, ',')};${e.link};${e.snippet.replace(/;/g, ',')}`
        ).join("\n");

        const filePath = path.join(__dirname, 'public', 'results.csv');
        fs.writeFileSync(filePath, csvContent);

        // Odpověď s informací o úspěšném vyhledávání
        res.send(`
            <html>
                <body>
                    <h1>Výsledky pro: ${query}</h1>
                    <a href="/results.csv" download>Stáhnout jako .CSV</a>
                    <br><br>
                    <a href="/">Vrátit se a spustit nové vyhledávání</a>
                    <div id="results">
                        ${results.map(item => `
                            <div class="result-item">
                                <h3 class="result-title"><a href="${item.link}" target="_blank">${item.title}</a></h3>
                                <div class="result-snippet">
                                    <span class="snippet">${item.snippet}</span>
                                </div>
                            </div>
                        `).join('<hr>')}
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error(error);
        res.status(500).send('Došlo k chybě při zpracování požadavku.');
    }
});