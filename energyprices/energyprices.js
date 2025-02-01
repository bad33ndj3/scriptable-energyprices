// Energy Prices Widget with 2-Hour Caching
// Fetches 14 hours of electricity prices from frankenergie but only shows future prices.

const SETTINGS = {
    GRAPH: { WIDTH: 500, HEIGHT: 200 },
    CACHE: { DURATION: 2 * 60 * 60 * 1000, FILE: "energy_prices_cache.json" }
};

// API Call
async function fetchElectricityPrices() {
    const today = new Date().toISOString().slice(0, 10);

    const request = new Request("https://www.frankenergie.nl/graphql");
    request.method = "POST";
    request.headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0",
        "Accept": "*/*", "Accept-Language": "en-US,en;q=0.5",
        "content-type": "application/json", "x-country": "NL",
        "x-graphql-client-name": "frank-www", "x-graphql-client-version": "5.60.0",
        "Sec-GPC": "1", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-origin"
    };
    request.body = JSON.stringify({
        query: `query MarketPrices($date: String!) {
              marketPrices(date: $date) { electricityPrices { from till allInPrice } } }`,
        variables: { date: today }, operationName: "MarketPrices"
    });

    return await request.loadJSON();
}

// Caching Logic
async function getCachedElectricityPrices() {
    const fm = FileManager.local();
    const cachePath = fm.joinPath(fm.cacheDirectory(), SETTINGS.CACHE.FILE);

    if (fm.fileExists(cachePath)) {
        const cacheAge = Date.now() - fm.modificationDate(cachePath).getTime();
        if (cacheAge < SETTINGS.CACHE.DURATION) {
            console.log(`Using cached data (age: ${(cacheAge / 1000 / 60).toFixed(1)} min)`);
            return JSON.parse(fm.readString(cachePath));
        }
    }

    console.log("Fetching new electricity prices...");
    const data = await fetchElectricityPrices();
    fm.writeString(cachePath, JSON.stringify(data));
    return data;
}

// Process Data
function filterFuturePrices(prices) {
    const now = new Date();
    const endTime = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    return prices.filter(p => new Date(p.from) >= now && new Date(p.from) <= endTime)
        .sort((a, b) => new Date(a.from) - new Date(b.from));
}

// Find Cheapest 4-Hour Window
function findCheapestWindow(data, windowSize = 4) {
    return data.reduce((best, _, i, arr) => {
        if (i > arr.length - windowSize) return best;
        const sum = arr.slice(i, i + windowSize).reduce((a, b) => a + b, 0);
        return sum < best.sum ? { sum, start: i } : best;
    }, { sum: Infinity, start: 0 });
}

// Generate Graph
function drawBarChart(dataPoints, cheapestWindow) {
    const { WIDTH, HEIGHT } = SETTINGS.GRAPH;
    const margin = 10, chartW = WIDTH - 2 * margin, chartH = HEIGHT - 2 * margin;

    const minVal = Math.min(...dataPoints), maxVal = Math.max(...dataPoints);
    const baseline = minVal < 0 ? minVal : 0;
    const range = maxVal - baseline || 1;

    const draw = new DrawContext();
    draw.size = new Size(WIDTH, HEIGHT);
    draw.opaque = false;
    draw.setLineWidth(2);

    const numBars = dataPoints.length;
    const barWidth = (chartW / numBars) * 0.8;

    dataPoints.forEach((val, i) => {
        const x = margin + i * (chartW / numBars) + (chartW / numBars - barWidth) / 2;
        const barHeight = ((val - baseline) / range) * chartH;
        const y = margin + chartH - barHeight;

        if (i >= cheapestWindow.start && i < cheapestWindow.start + 4) {
            draw.setFillColor(new Color("#ffffff"));
            draw.fillRect(new Rect(x, y, barWidth, barHeight));
        } else {
            draw.setStrokeColor(new Color("#ffffff"));
            draw.strokeRect(new Rect(x, y, barWidth, barHeight));
        }
    });

    return draw.getImage();
}

// Create Widget
async function createWidget() {
    const widget = new ListWidget();
    widget.backgroundColor = new Color("#222222");

    const data = await getCachedElectricityPrices();
    const prices = data?.data?.marketPrices?.electricityPrices;
    if (!prices || prices.length === 0) return widget.addText("No data");

    const filteredPrices = filterFuturePrices(prices);
    if (filteredPrices.length < 2) return widget.addText("Not enough data");

    const dataPoints = filteredPrices.map(p => p.allInPrice);
    const cheapestWindow = findCheapestWindow(dataPoints);

    // Calculate cheapest time offset
    const now = new Date();
    let cheapestStartOffset = "";
    if (cheapestWindow) {
        const cheapestStartTime = new Date(filteredPrices[cheapestWindow.start].from);
        const hoursOffset = Math.round((cheapestStartTime - now) / (60 * 60 * 1000));
        cheapestStartOffset = hoursOffset === 0 ? " now" : ` @${hoursOffset}h`;
    }

    // Title
    const minPrice = Math.min(...dataPoints).toFixed(2);
    const maxPrice = Math.max(...dataPoints).toFixed(2);
    const titleText = `${minPrice} - ${maxPrice}${cheapestStartOffset}`;

    widget.addImage(drawBarChart(dataPoints, cheapestWindow)).centerAlignImage();
    const title = widget.addText(titleText);
    title.font = Font.systemFont(12);
    title.centerAlignText();
    title.textColor = new Color("#ffffff");

    return widget;
}

// Run Widget
const widget = await createWidget();
Script.setWidget(widget);
Script.complete();