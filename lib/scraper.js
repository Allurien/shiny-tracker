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

    const titleEl = card.find(
      ".product-card-container-content-title a, .product-card-container-content-title"
    );
    const title = titleEl.text().trim();

    let url =
      titleEl.closest("a").attr("href") ||
      card.find("a").first().attr("href") ||
      "";
    if (url && !url.startsWith("http")) {
      url = `https://www.diamondartclub.com${url}`;
    }

    const image =
      card.find("img").attr("src") || card.find("img").attr("data-src") || "";

    const price =
      card.find(".product-card-container-content-footer").text().trim() || "";

    if (title) {
      products.push({ title, url, image, price });
    }
  });

  return products;
}

module.exports = { fetchProducts, CHECK_URL };
