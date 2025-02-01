// Energy Prices Widget with 2-Hour Caching & "now" Fix
// Fetches 14 hours of electricity prices from frankenergie, but only displays future prices.
// Cached for 2 hours to reduce API requests.

const GRAPH_WIDTH = 500;
const GRAPH_HEIGHT = 200;
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
const CACHE_FILE = "energy_prices_cache.json"; // Cache file name

async function fetchElectricityPrices() {
    let now = new Date();
    let currentDateStr = now.toISOString().slice(0, 10);

    let reqBody = {
        query: `
      query MarketPrices($date: String!) {
        marketPrices(date: $date) {
          electricityPrices {
            from
            till
            allInPrice
            perUnit
          }
        }
      }
    `,
        variables: { date: currentDateStr },
        operationName: "MarketPrices"
    };

    let req = new Request("https://www.frankenergie.nl/graphql");
    req.method = "POST";
    req.headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.5",
        "content-type": "application/json",
        "x-country": "NL",
        "x-graphql-client-name": "frank-www",
        "x-graphql-client-os": "firefox/134.0",
        "x-graphql-client-version": "5.60.0",
        "Sec-GPC": "1",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
    };
    req.body = JSON.stringify(reqBody);

    let json = await req.loadJSON();
    return json;
}

async function getCachedElectricityPrices() {
    let fm = FileManager.local();
    let cachePath = fm.joinPath(fm.cacheDirectory(), CACHE_FILE);

    if (fm.fileExists(cachePath)) {
        let modDate = fm.modificationDate(cachePath);
        let age = Date.now() - modDate.getTime();
        if (age < CACHE_DURATION) {
            console.log("Using cached electricity prices (age: " + (age / 1000 / 60).toFixed(1) + " min)");
            return JSON.parse(fm.readString(cachePath));
        }
    }

    console.log("Fetching new electricity prices...");
    let json = await fetchElectricityPrices();
    fm.writeString(cachePath, JSON.stringify(json));
    return json;
}

function filterPrices(prices, now) {
    let startTime = new Date(now); // Show only future prices
    let endTime = new Date(now.getTime() + 12 * 60 * 60 * 1000); // Display next 12 hours

    return prices
        .filter(p => new Date(p.from) >= startTime && new Date(p.from) <= endTime)
        .sort((a, b) => new Date(a.from) - new Date(b.from));
}

function findCheapestWindow(dataPoints, windowSize = 4) {
    let bestSum = Infinity, bestIndex = 0;
    for (let i = 0; i <= dataPoints.length - windowSize; i++) {
        let sum = dataPoints.slice(i, i + windowSize).reduce((a, b) => a + b, 0);
        if (sum < bestSum) [bestSum, bestIndex] = [sum, i];
    }
    return { start: bestIndex, end: bestIndex + windowSize - 1 };
}

function drawBarChart(dataPoints) {
    let draw = new DrawContext();
    draw.size = new Size(GRAPH_WIDTH, GRAPH_HEIGHT);
    draw.opaque = false;

    const margin = 10, chartWidth = GRAPH_WIDTH - margin * 2, chartHeight = GRAPH_HEIGHT - margin * 2;
    let rawMin = Math.min(...dataPoints), rawMax = Math.max(...dataPoints);
    let baseline = rawMin < 0 ? rawMin : 0;
    rawMax = (rawMax === baseline) ? baseline + 1 : rawMax;

    let numBars = dataPoints.length, allocatedSlot = chartWidth / numBars, barWidth = allocatedSlot * 0.8;
    let cheapestWindow = findCheapestWindow(dataPoints, 4);

    draw.setLineWidth(2);
    for (let i = 0; i < numBars; i++) {
        let barHeight = ((dataPoints[i] - baseline) / (rawMax - baseline)) * chartHeight;
        let x = margin + i * allocatedSlot + (allocatedSlot - barWidth) / 2;
        let y = margin + chartHeight - barHeight;

        if (cheapestWindow && i >= cheapestWindow.start && i <= cheapestWindow.end) {
            draw.setFillColor(new Color("#ffffff")); // **Reverted to full white for cheapest bars**
            draw.fillRect(new Rect(x, y, barWidth, barHeight));
        } else {
            draw.setStrokeColor(new Color("#ffffff")); // **Reverted to white outline**
            draw.strokeRect(new Rect(x, y, barWidth, barHeight));
        }
    }

    return draw.getImage();
}

async function createWidget() {
    let widget = new ListWidget();
    widget.backgroundColor = new Color("#222222");

    let now = new Date();
    let json = await getCachedElectricityPrices();

    let prices = json.data.marketPrices.electricityPrices;
    if (!prices || prices.length === 0) {
        widget.addText("No electricity price data");
        return widget;
    }

    let filteredPrices = filterPrices(prices, now);
    if (filteredPrices.length < 2) {
        widget.addText("Not enough data for graph");
        return widget;
    }

    let dataPoints = filteredPrices.map(p => p.allInPrice);
    let rawMin = Math.min(...dataPoints), rawMax = Math.max(...dataPoints);

    let cheapestWindow = findCheapestWindow(dataPoints, 4);
    let cheapestStartOffset = "";
    if (cheapestWindow) {
        let cheapestStartTime = new Date(filteredPrices[cheapestWindow.start].from);
        let hoursOffset = Math.round((cheapestStartTime - now) / (60 * 60 * 1000));
        cheapestStartOffset = (hoursOffset === 0) ? " now" : ` @${hoursOffset}h`; // ✅ **Fix: Replaces "0h" with "now"**
    }

    let titleText = `${rawMin.toFixed(2)} - ${rawMax.toFixed(2)}${cheapestStartOffset}`;

    let imgWidget = widget.addImage(drawBarChart(dataPoints));
    imgWidget.centerAlignImage();

    let title = widget.addText(titleText);
    title.font = Font.systemFont(12);
    title.centerAlignText();
    title.textColor = new Color("#ffffff");

    return widget;
}

let widget = await createWidget();
Script.setWidget(widget);
Script.complete();