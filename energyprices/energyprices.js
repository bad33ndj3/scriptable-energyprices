// Frank Energie Electricity Prices Widget (Bar Chart with Min/Max Labels)
// This Scriptable widget fetches electricity prices from frankenergie,
// filters for the next 12 hours, draws a bar chart of the "allInPrice" values,
// and displays the min and max prices on the right side of the chart.

const GRAPH_WIDTH = 550;  // increased width to reserve space for text
const GRAPH_HEIGHT = 200;
const TEXT_AREA_WIDTH = 50;  // reserved area on the right for labels

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

function drawBarChart(dataPoints) {
    let draw = new DrawContext();
    draw.size = new Size(GRAPH_WIDTH, GRAPH_HEIGHT);

    // Draw dark background.
    draw.setFillColor(new Color("#333333"));
    draw.fillRect(new Rect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT));

    const margin = 10;
    // Reserve TEXT_AREA_WIDTH on the right; the chart area is:
    const chartWidth = GRAPH_WIDTH - margin * 2 - TEXT_AREA_WIDTH;
    const chartHeight = GRAPH_HEIGHT - margin * 2;

    let minPrice = Math.min(...dataPoints);
    let maxPrice = Math.max(...dataPoints);
    if (maxPrice === minPrice) { maxPrice += 1; } // avoid division by zero

    let numBars = dataPoints.length;
    let allocatedSlot = chartWidth / numBars;
    // Make each bar 80% of the allocated slot.
    let barWidth = allocatedSlot * 0.8;

    draw.setStrokeColor(new Color("#ffffff"));
    draw.setLineWidth(2);

    for (let i = 0; i < numBars; i++) {
        let normalized = (dataPoints[i] - minPrice) / (maxPrice - minPrice);
        let barHeight = normalized * chartHeight;
        // Center the bar in its allocated slot.
        let x = margin + i * allocatedSlot + (allocatedSlot - barWidth) / 2;
        // y starts from the bottom.
        let y = margin + chartHeight - barHeight;
        draw.strokeRect(new Rect(x, y, barWidth, barHeight));
    }

    // Draw min and max price labels in the reserved text area on the right.
    draw.setFont(Font.systemFont(12));
    draw.setTextColor(new Color("#ffffff"));

    let maxText = maxPrice.toFixed(2);
    let minText = minPrice.toFixed(2);

    // Define text rectangles in the reserved area.
    let textX = margin + chartWidth; // starting x for text area
    let textWidth = TEXT_AREA_WIDTH - 5; // some padding

    let textRectMax = new Rect(textX, margin, textWidth, chartHeight / 2);
    let textRectMin = new Rect(textX, margin + chartHeight / 2, textWidth, chartHeight / 2);

    draw.drawTextInRect(maxText, textRectMax);
    draw.drawTextInRect(minText, textRectMin);

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
    let chartImage = drawBarChart(dataPoints);
    let imgWidget = widget.addImage(chartImage);
    imgWidget.centerAlignImage();

    let title = widget.addText("12h Prices");
    title.font = Font.systemFont(12);
    title.centerAlignText();
    title.textColor = new Color("#ffffff");

    return widget;
}

let widget = await createWidget();
Script.setWidget(widget);
Script.complete();