(function () {
  'use strict';

  var CACHE_PREFIX = 'software-stats-v1:';
  var REFRESH_MS = 15 * 60 * 1000;
  var FAMILY_PATTERNS = {
    'neohorse-1': /^TokenRhythm\/NeoHorse-1-(?:4B|9B)(?:$|-)/,
    'neohorse-jev': /^TokenRhythm\/NeoHorse-Jev-4B(?:$|-)/
  };

  function validCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function modelTotals(models) {
    if (!Array.isArray(models)) throw new Error('Invalid Hugging Face response');
    var totals = {};
    Object.keys(FAMILY_PATTERNS).forEach(function (family) {
      var seen = new Set();
      var members = models.filter(function (model) {
        var id = model.id || model.modelId;
        if (model.private || model.disabled || !FAMILY_PATTERNS[family].test(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      // Never present a partial total as the full family's download count.
      if (!members.length || members.some(function (model) { return !validCount(model.downloadsAllTime); })) return;
      var value = members.reduce(function (sum, model) { return sum + model.downloadsAllTime; }, 0);
      if (validCount(value)) {
        totals[family] = { value: value, repos: members.map(function (model) { return model.id || model.modelId; }).sort() };
      }
    });
    return totals;
  }

  function nextPage(link) {
    var match = (link || '').match(/<([^>]+)>;\s*rel="?next"?/);
    return match ? match[1] : null;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { modelTotals: modelTotals, nextPage: nextPage, validCount: validCount };
  }
  if (typeof document === 'undefined') return;

  var memory = {};
  var running = {};

  function cached(key) {
    if (memory[key]) return memory[key];
    try {
      var entry = JSON.parse(localStorage.getItem(CACHE_PREFIX + key));
      if (entry && validCount(entry.value) && Number.isFinite(entry.checkedAt) && entry.checkedAt <= Date.now()) {
        memory[key] = entry;
        return entry;
      }
    } catch (error) { /* Storage can be disabled in private browsing. */ }
    return null;
  }

  function save(key, entry) {
    memory[key] = entry;
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry)); } catch (error) { /* Use memory only. */ }
  }

  function render(nodes, entry, status) {
    nodes.forEach(function (node) {
      node.dataset.status = status;
      var value = node.querySelector('[data-stat-value]');
      var label = node.hasAttribute('data-hf-family') ? 'Hugging Face downloads (all time)' : 'GitHub stars';
      if (!entry) {
        value.textContent = '\u2014';
        node.title = label + ': temporarily unavailable. Open the source to see its latest statistics.';
        node.setAttribute('aria-label', node.title);
        return;
      }
      value.textContent = entry.value.toLocaleString('en-US');
      var detail = label + ': ' + value.textContent + '. Last checked ' + new Date(entry.checkedAt).toLocaleString() + '.';
      if (entry.repos) detail += ' Sum of ' + entry.repos.length + ' official repositories: ' + entry.repos.join(', ') + '.';
      if (status === 'cached') detail += ' Showing the last successful result; live refresh is temporarily unavailable.';
      node.title = detail;
      node.setAttribute('aria-label', detail);
    });
  }

  async function requestJSON(url) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 12000);
    try {
      var response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error('Statistics API returned ' + response.status);
      return { data: await response.json(), link: response.headers.get('Link') };
    } finally { clearTimeout(timeout); }
  }

  async function fetchModels() {
    var params = new URLSearchParams({ author: 'TokenRhythm', limit: '100' });
    ['downloadsAllTime', 'private', 'disabled'].forEach(function (field) { params.append('expand', field); });
    var url = 'https://huggingface.co/api/models?' + params.toString();
    var models = [];
    var pages = 0;
    while (url) {
      if (++pages > 20 || new URL(url).origin !== 'https://huggingface.co') throw new Error('Invalid model pagination');
      var result = await requestJSON(url);
      if (!Array.isArray(result.data)) throw new Error('Invalid model list');
      models = models.concat(result.data);
      url = nextPage(result.link);
      if (result.data.length === 100 && !url) throw new Error('Cannot verify a complete model list');
    }
    return modelTotals(models);
  }

  function start() {
    var github = {};
    document.querySelectorAll('[data-github-repo]').forEach(function (node) {
      var repo = node.dataset.githubRepo;
      if (!github[repo]) github[repo] = [];
      github[repo].push(node);
    });
    var families = {};
    document.querySelectorAll('[data-hf-family]').forEach(function (node) {
      var family = node.dataset.hfFamily;
      if (!families[family]) families[family] = [];
      families[family].push(node);
    });

    function showOrFetch(key, nodes, loader) {
      var entry = cached(key);
      if (entry) render(nodes, entry, 'cached');
      if (entry && Date.now() - entry.checkedAt < REFRESH_MS) {
        render(nodes, entry, 'current');
        return;
      }
      if (running[key]) return;
      running[key] = true;
      loader().then(function (result) {
        if (!result || !validCount(result.value)) throw new Error('Missing statistic');
        result.checkedAt = Date.now();
        save(key, result);
        render(nodes, result, 'current');
      }).catch(function () {
        render(nodes, cached(key), cached(key) ? 'cached' : 'unavailable');
      }).finally(function () { delete running[key]; });
    }

    function refresh() {
      if (document.hidden) return;
      Object.keys(github).forEach(function (repo) {
        showOrFetch('github:' + repo, github[repo], async function () {
          var result = await requestJSON('https://api.github.com/repos/' + repo);
          return { value: result.data.stargazers_count };
        });
      });
      var modelRequest;
      Object.keys(families).forEach(function (family) {
        showOrFetch('hf:' + family, families[family], function () {
          if (!modelRequest) modelRequest = fetchModels();
          return modelRequest.then(function (totals) { return totals[family]; });
        });
      });
    }
    refresh();
    setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}());
