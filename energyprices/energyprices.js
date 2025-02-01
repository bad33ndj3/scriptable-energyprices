// Frank Energie Electricity Prices Widget (Bar Chart with Title Showing Min-Max & Cheapest Window Start)
// This widget fetches electricity prices from frankenergie for the next 12 hours,
// draws a bar chart (with white, outlined bars) on a dark background,
// and sets its title to "min - max / @Xh", where X is the number of hours
// from now when the cheapest 4 consecutive hours start.

const GRAPH_WIDTH = 500;      // overall canvas width
const GRAPH_HEIGHT = 200;

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
        "Sec-Fetch-Site": "same-origin",
        "Referer": "https://www.frankenergie.nl/nl?aff_id=o52puy&gad_source=1&gclid=CjwKCAiAqfe8BhBwEiwAsne6gXoX0Ko-jlu-56JInLh_zOQtP8jTGJ-6vcJF441Sdfg_0KKDW6QY8RoCO_AQAvD_BwE"
    };
    req.body = JSON.stringify(reqBody);

    let json = await req.loadJSON();
    return json;
}

function filterPrices(prices, now) {
    let endTime = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    let filtered = prices.filter(p => {
        let priceTime = new Date(p.from);
        return priceTime >= now && priceTime <= endTime;
    });
    filtered.sort((a, b) => new Date(a.from) - new Date(b.from));
    return filtered;
}

function findCheapestWindow(dataPoints, windowSize = 4) {
    let numBars = dataPoints.length;
    if(numBars < windowSize) return null;
    let bestSum = Infinity;
    let bestIndex = 0;
    for (let i = 0; i <= numBars - windowSize; i++) {
        let sum = 0;
        for (let j = 0; j < windowSize; j++) {
            sum += dataPoints[i + j];
        }
        if (sum < bestSum) {
            bestSum = sum;
            bestIndex = i;
        }
    }
    return { start: bestIndex, end: bestIndex + windowSize - 1 };
}

function drawBarChart(dataPoints) {
    let draw = new DrawContext();
    draw.size = new Size(GRAPH_WIDTH, GRAPH_HEIGHT);

    // Draw dark background.
    draw.setFillColor(new Color("#333333"));
    draw.fillRect(new Rect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT));

    const margin = 10;
    const chartWidth = GRAPH_WIDTH - margin * 2;
    const chartHeight = GRAPH_HEIGHT - margin * 2;

    // Determine the baseline: use 0 if all values are above 0; otherwise, the raw minimum.
    let rawMin = Math.min(...dataPoints);
    let rawMax = Math.max(...dataPoints);
    let baseline = rawMin < 0 ? rawMin : 0;
    if (rawMax === baseline) { rawMax = baseline + 1; }

    let numBars = dataPoints.length;
    let allocatedSlot = chartWidth / numBars;
    let barWidth = allocatedSlot * 0.8;

    // Find the cheapest window (4 consecutive hours) using dataPoints.
    let cheapestWindow = findCheapestWindow(dataPoints, 4);

    draw.setLineWidth(2);
    for (let i = 0; i < numBars; i++) {
        // Normalize relative to the baseline.
        let normalized = (dataPoints[i] - baseline) / (rawMax - baseline);
        let barHeight = normalized * chartHeight;
        let x = margin + i * allocatedSlot + (allocatedSlot - barWidth) / 2;
        let y = margin + chartHeight - barHeight;

        // Use white for default; green for bars in the cheapest window.
        let strokeColor = new Color("#ffffff");
        if (cheapestWindow && i >= cheapestWindow.start && i <= cheapestWindow.end) {
            strokeColor = new Color("#00ff00");
        }
        draw.setStrokeColor(strokeColor);
        draw.strokeRect(new Rect(x, y, barWidth, barHeight));
    }

    return draw.getImage();
}

async function createWidget() {
    let widget = new ListWidget();
    widget.backgroundColor = new Color("#333333");

    let now = new Date();
    let json;
    try {
        json = await fetchElectricityPrices();
    } catch (error) {
        widget.addText("Error loading data: " + error);
        return widget;
    }

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
    // Compute raw min and max for title.
    let rawMin = Math.min(...dataPoints);
    let rawMax = Math.max(...dataPoints);
    // Determine the cheapest window.
    let cheapestWindow = findCheapestWindow(dataPoints, 4);
    let cheapestStartOffset = "";
    if (cheapestWindow) {
        // Compute hours from now until the start of the cheapest window.
        let cheapestStartTime = new Date(filteredPrices[cheapestWindow.start].from);
        let hoursOffset = ((cheapestStartTime - now) / (60 * 60 * 1000));
        cheapestStartOffset = " @"+ Math.round(hoursOffset) + "h";
    }

    let titleText = `${rawMin.toFixed(2)} - ${rawMax.toFixed(2)}${cheapestStartOffset}`;

    let chartImage = drawBarChart(dataPoints);
    let imgWidget = widget.addImage(chartImage);
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