document.addEventListener('DOMContentLoaded', function () {
  var selector = [
    'a[href*="scholar.google.com"]',
    'a[href*="github.com/JarvisPei"]',
    'a[href*="linkedin.com/in/zehua-pei"]'
  ].join(',');

  document.querySelectorAll(selector).forEach(function (link) {
    var label = link.textContent.trim();
    if (label) {
      link.setAttribute('aria-label', label);
      link.setAttribute('title', label);
    }
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  });
});
