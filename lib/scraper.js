const axios = require("axios");
const cheerio = require("cheerio");

const CHECK_URL =
  process.env.CHECK_URL ||
  "https://www.diamondartclub.com/collections/diamond-painting-restocks";

async function fetchProducts() {
  const { data: html } = await axios.get(CHECK_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    },
  });

  const $ = cheerio.load(html);
  const products = [];

  $(".product-card").each((_i, el) => {
    const card = $(el);

    // Prefer the anchor inside the title container to avoid grabbing text twice
    const titleContainer = card.find(".product-card-container-content-title");
    const titleAnchor = titleContainer.find("a").first();
    const title = (titleAnchor.length ? titleAnchor : titleContainer)
      .text()
      .trim();

    let url = titleAnchor.attr("href") || card.find("a").first().attr("href") || "";
    if (url && !url.startsWith("http")) {
      url = `https://www.diamondartclub.com${url}`;
    }

    let image =
      card.find("img").attr("src") || card.find("img").attr("data-src") || "";
    // Fix protocol-relative URLs
    if (image.startsWith("//")) {
      image = `https:${image}`;
    }

    // Try dedicated price element first, fall back to footer text
    let price = card.find(".product-card-price, .money").first().text().trim();
    if (!price || price.toLowerCase() === "view product") {
      price = "";
    }

    if (title) {
      products.push({ title, url, image, price });
    }
  });

  return products;
}

module.exports = { fetchProducts, CHECK_URL };
