"use strict";

const puppeteer = require("puppeteer"),
  devices = puppeteer.devices,
  fs = require("fs");

class SearchScraper {
  log(...args) {
    console.log(...args);
  }

  static register(c) {
    if (this._scrapers[c.name]) {
      console.warn(`Scraper already registered: ${c.name}`);
    }
    return (this._scrapers[c.name] = new SearchScraper(c));
  }

  static getScraper(name) {
    return this._scrapers[name];
  }

  static configure(conf) {
    if (!Array.isArray(conf)) {
      conf = [conf];
    }
    return conf.map((c) => SearchScraper.register(c));
  }

  static search(term, options) {
    const scr = SearchScraper.getScraper(options.engine);
    return scr.search(term, options);
  }

  static trySearch(term, options, limit) {
    const scr = SearchScraper.getScraper(options.engine);
    return scr.search(term, options, limit);
  }

  constructor(options) {
    this.options = Object.assign(
      {
        limit: 100,
        page_limit: 10,
        headless: false,
        debugDir: "",
        searchUrl: "https://google.com",
        selectors: {},
        onFileWrite(path, content) {},
      },
      options
    );
  }

  delay = async (min, max) => {
    const timeout = Math.floor(min + Math.random() * (max - min));
    return new Promise((resolve) => setTimeout(resolve, timeout));
  };

  async search(term, _options) {
    const options = Object.assign({}, this.options, _options);
    options.selectors.result = options.selectors.result || {};

    const saveHtmlAndImg = async (index) => {
      if (!options.debugDir) return;

      try {
        this.log("Saving " + index);
        const p = `${options.debugDir}/${index}`;
        await page.waitForSelector("html", { timeout: 3000 }); // Bekle!
        await page.screenshot({ path: `${p}.png` });
        const html = await page.$eval("html", (e) => e.outerHTML);
        const filePath = `${p}.html`;
        fs.writeFileSync(filePath, html);
        options.onFileWrite(filePath, html);
      } catch (e) {
        console.error(
          `Failed to save HTML and image, but continuing: ${index}`
        );
        console.error(e.message);
      }
    };

    this.log("Loading the browser", options);
    const launchArgs = ["--no-sandbox", "--disable-setuid-sandbox"];
    let proxyAuth = null;

    if (options.proxy) {
      const p = options.proxy.split(":");
      if (p.length === 4) {
        const [ip, port, u, pw] = p;
        launchArgs.push(`--proxy-server=http://${ip}:${port}`);
        proxyAuth = { username: u, password: pw };
      } else if (p.length === 2) {
        const [ip, port] = p;
        launchArgs.push(`--proxy-server=http://${ip}:${port}`);
      }
    }

    const browser = await puppeteer.launch({
      headless: options.headless,
      args: launchArgs,
    });

    const page = await browser.newPage();
    if (proxyAuth) await page.authenticate(proxyAuth).catch(() => {});

    if (options.device) {
      const simulator = devices[options.device] || options.device;
      await page.emulate(simulator);
    }

    await page.goto(options.searchUrl, { waitUntil: "domcontentloaded" });
    await this.delay(1500, 3000);

    await saveHtmlAndImg(term + "_starting");

    if (typeof options.selectors.accept_terms_button === "function") {
      try {
        await page.evaluate(options.selectors.accept_terms_button);
        await this.delay(1000, 2000);
        await saveHtmlAndImg(term + "1_accept_terms_button");
      } catch (e) {}
    }
    await this.delay(1000, 2000);

    const inputSelector = options.selectors.search_box;

    await page.focus(inputSelector); // insan gibi odaklan
    await page.click(inputSelector, { delay: 50 }); // click simülasyonu
    await saveHtmlAndImg(term + "_search_focus");

    for (const char of term.split("")) {
      await page.keyboard.type(char, { delay: 150 + Math.random() * 75 });
      await page.mouse.move(
        100 + Math.random() * 100,
        200 + Math.random() * 100,
        { steps: 5 }
      ); // yazarken mouse oynat
    }
    await saveHtmlAndImg(term + "_search_finish");

    // await page.waitForSelector(
    //   'form[name="f"] input[name="q"], form[name="gs"] textarea[name="q"] ',
    //   { visible: true }
    // );

    // await page.type(
    //   'form[name="f"] input[name="q"],form[name="gs"] textarea[name="q"]',
    //   term,
    //   { delay: 100 }
    // );

    await page.mouse.move(
      100 + Math.random() * 100,
      300 + Math.random() * 100,
      { steps: 5 }
    );

    await page.evaluate(() => {
      const form = document.querySelector("form[action='/search']");
      if (form) form.submit();
    });

    await page.waitForNavigation({ waitUntil: "networkidle2" });

    await this.delay(5000, 1000);

    await page.mouse.move(
      100 + Math.random() * 100,
      300 + Math.random() * 100,
      { steps: 5 }
    );

    await saveHtmlAndImg(term + "_search_submit_data_geldi");

    if (typeof options.selectors.accept_terms_button === "function") {
      try {
        await page.mouse.move(
          100 + Math.random() * 100,
          300 + Math.random() * 100,
          { steps: 5 }
        );

        await page.evaluate(options.selectors.accept_terms_button);
        await this.delay(1000, 2000);
        await saveHtmlAndImg(term + "2_accept_terms_button");
      } catch (e) {}
    }

    const resultSelector = options.selectors.result_items;
    await page.waitForSelector(resultSelector, {
      timeout: 3000,
    });
    await saveHtmlAndImg(term + "_search_submit_data");

    await page.evaluate(() => window.scrollBy(0, 300 + Math.random() * 300));

    await page.mouse.move(
      100 + Math.random() * 100,
      300 + Math.random() * 100,
      { steps: 5 }
    );

    await this.delay(500, 1000);

    const results = await page.evaluate((opts) => {
      const items = document.querySelectorAll(opts.selectors.result_items);
      const titleSel = opts.selectors.result.title;
      const linkSel = opts.selectors.result.link;
      const descSel = opts.selectors.result.description;

      return Array.from(items)
        .map((item) => {
          return {
            title: item.querySelector(titleSel)?.textContent || null,
            url: item.querySelector(linkSel)?.href || null,
            description: item.querySelector(descSel)?.textContent || null,
          };
        })
        .filter((res) => res.url && res.title);
    }, options);

    this.log("Closing the browser");
    try {
      await browser.close();
    } catch (e) {}

    return results.slice(0, options.limit);
  }
}

// Scrapers and Selectors
const clickAcceptAllBtn = () => {
  // Buton text'ine göre klasik yöntem (eski sürümler)
  const btns = Array.from(document.querySelectorAll("button")).filter((c) =>
    /accept|agree|kabul|accepter|aceptar/i.test(c.textContent)
  );
  if (btns.length) {
    btns.forEach((b) => b.click());
    return;
  }

  // Yeni sürüm: input submit butonuna göre
  const inputs = Array.from(
    document.querySelectorAll('input[type="submit"]')
  ).filter((i) => /accept all/i.test(i.value));
  if (inputs.length) {
    inputs.forEach((i) => i.click());
  }

  // Form varsa otomatik submit de yapılabilir
  const acceptForm = document.querySelector(
    'form[action*="consent.google.com/save"]'
  );
  if (acceptForm) {
    acceptForm.submit();
  }
};

SearchScraper._scrapers = {};

SearchScraper.Selectors = {
  GOOGLE: {
    search_box: "form[action='/search'] textarea, form[action='/search'] input",
    result_items: "#search [data-hveid], #search [data-ved]",
    next_page: "#pnnext",
    result: {
      title: "h3",
      link: "a[onmousedown], a[ping], a[data-jsarwt]",
      description: "div[data-sncf='1']",
    },
    accept_terms_button: clickAcceptAllBtn,
  },
  GOOGLE_MOBILE: {
    search_box: "form[action='/search'] textarea, form[action='/search'] input",
    result_items: "#center_col [data-hveid], #center_col [data-ved]",
    load_more: "a[jsname][data-ved][jsaction][aria-label]",
    result: {
      title: "[aria-level='3']",
      link: "a[ping]",
      description: "div[data-sncf='1']",
    },
    accept_terms_button: clickAcceptAllBtn,
  },
  BING: {
    search_box: "form[action='/search'] input[type='text']",
    result_items: "#b_results .b_algo",
    next_page: "#b_results > li.b_pag > nav > ul > li:last-of-type > a",
    result: {
      title: "h2",
      link: "a",
      description: "p",
    },
    accept_terms_button: "#bnp_btn_accept",
  },
};

module.exports = SearchScraper;
