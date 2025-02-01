// Frank Energie Electricity Prices Widget (Electricity Only)
// This Scriptable widget fetches electricity prices from frankenergie,
// filters for the next 12 hours, draws a graph of the "allInPrice" values,
// and sets the widget.

const GRAPH_WIDTH = 400;
const GRAPH_HEIGHT = 200;

async function fetchElectricityPrices() {
    let now = new Date();
    let currentDateStr = now.toISOString().slice(0, 10);

    // Build the GraphQL request payload.
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

    // Await the network response.
    let json = await req.loadJSON();
    return json;
}

function filterPrices(prices, now) {
    // Filter the electricity prices to include only entries in the next 12 hours.
    let endTime = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    let filtered = prices.filter(p => {
        let priceTime = new Date(p.from);
        return priceTime >= now && priceTime <= endTime;
    });
    filtered.sort((a, b) => new Date(a.from) - new Date(b.from));
    return filtered;
}

function drawGraph(dataPoints) {
    let draw = new DrawContext();
    draw.size = new Size(GRAPH_WIDTH, GRAPH_HEIGHT);

    // Draw a white background.
    draw.setFillColor(new Color("#ffffff"));
    draw.fillRect(new Rect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT));

    const margin = 20;
    const graphWidth = GRAPH_WIDTH - margin * 2;
    const graphHeight = GRAPH_HEIGHT - margin * 2;

    let minPrice = Math.min(...dataPoints);
    let maxPrice = Math.max(...dataPoints);
    if (maxPrice === minPrice) { maxPrice += 1; } // avoid division by zero

    let pointSpacing = graphWidth / (dataPoints.length - 1);
    let points = [];
    for (let i = 0; i < dataPoints.length; i++) {
        let normalized = (dataPoints[i] - minPrice) / (maxPrice - minPrice);
        let x = margin + i * pointSpacing;
        let y = margin + graphHeight * (1 - normalized); // invert y-axis
        points.push(new Point(x, y));
    }
    console.log("Graph points: " + JSON.stringify(points));

    // Draw the line graph using a Path.
    let path = new Path();
    path.move(points[0]);
    for (let i = 1; i < points.length; i++) {
        path.addLine(points[i]);
    }
    draw.addPath(path);
    draw.strokePath(path);

    // Draw small circles at each data point.
    draw.setFillColor(new Color("#007aff"));
    for (let pt of points) {
        draw.fillEllipse(new Rect(pt.x - 3, pt.y - 3, 6, 6));
    }

    return draw.getImage();
}

async function createWidget() {
    let widget = new ListWidget();
    widget.backgroundColor = new Color("#ffffff");

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
    let graphImage = drawGraph(dataPoints);
    let imgWidget = widget.addImage(graphImage);
    imgWidget.centerAlignImage();

    let title = widget.addText("Next 12h Electricity Prices");
    title.font = Font.systemFont(12);
    title.centerAlignText();

    return widget;
}

// Main entry point
let widget = await createWidget();
Script.setWidget(widget);
Script.complete();