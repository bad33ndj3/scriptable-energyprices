// Energy Prices Widget with 2-Hour Caching (Using EnergyZero API)
const SETTINGS = {
    GRAPH: { WIDTH: 500, HEIGHT: 200 },
    CACHE: { DURATION: 2 * 60 * 60 * 1000, FILE: "energy_prices_cache2.json" } // 2-hour caching
};

// Fetch electricity prices from EnergyZero API
async function fetchElectricityPrices() {
    const now = new Date();
    const fromTime = now.toISOString().slice(0, 14) + "00:00Z";
    const tillTime = new Date(now.getTime() + 14 * 60 * 60 * 1000).toISOString().slice(0, 14) + "00:00Z";

    console.log(`Fetching electricity prices from: ${fromTime} to ${tillTime}`);

    const request = new Request("https://api.energyzero.nl/v1/gql");
    request.method = "POST";
    request.headers = {
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "vendors": "5e94edf4-a182-4c7b-99c7-0bfb08c587c5",
        "content-type": "application/json",
    };
    request.body = JSON.stringify({
        query: `query EnergyMarketPrices($input: EnergyMarketPricesInput!) {
              energyMarketPrices(input: $input) {
                prices {
                  from
                  till
                  energyPriceIncl
                }
              }
            }`,
        variables: { input: { from: fromTime, till: tillTime, intervalType: "Hourly", type: "Electricity" } },
        operationName: "EnergyMarketPrices"
    });

    try {
        return await request.loadJSON();
    } catch (error) {
        console.error("Error fetching electricity prices: "+ error);
        return null;
    }
}

// Get cached prices or fetch new ones
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
    if (data) fm.writeString(cachePath, JSON.stringify(data));
    return data;
}

// Filter and sort only future prices
function filterFuturePrices(prices) {
    const now = new Date();
    const endTime = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    return prices.filter(p => new Date(p.from) >= now && new Date(p.from) <= endTime)
        .sort((a, b) => new Date(a.from) - new Date(b.from));
}

// Find the cheapest 4-hour window
function findCheapestWindow(data, windowSize = 4) {
    return data.reduce((best, _, i, arr) => {
        if (i > arr.length - windowSize) return best;
        const sum = arr.slice(i, i + windowSize).reduce((a, b) => a + b, 0);
        return sum < best.sum ? { sum, start: i } : best;
    }, { sum: Infinity, start: 0 });
}

// Generate the bar chart image
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

        draw.setFillColor(i >= cheapestWindow.start && i < cheapestWindow.start + 4 ? new Color("#ffffff") : new Color("#ffffff"));
        draw.fillRect(new Rect(x, y, barWidth, barHeight));
    });

    return draw.getImage();
}

// Create widget UI
async function createWidget() {
    const widget = new ListWidget();
    widget.backgroundColor = new Color("#222222");

    const data = await getCachedElectricityPrices();
    if (!data || !data.data || !data.data.energyMarketPrices?.prices) {
        console.error("No valid price data received.");
        widget.addText("⚠️ No data available");
        return widget;
    }

    const prices = data.data.energyMarketPrices.prices;
    console.log(`Received ${prices.length} price entries.`);

    const filteredPrices = filterFuturePrices(prices);
    if (filteredPrices.length < 2) {
        widget.addText("⚠️ Not enough data");
        return widget;
    }

    const dataPoints = filteredPrices.map(p => p.energyPriceIncl);
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

    console.log(`Graph Data: Min ${minPrice}, Max ${maxPrice}, Cheapest Window: ${cheapestStartOffset}`);

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