(function () {
  const $ = (s) => document.querySelector(s);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (s) => { s = Math.floor(s); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
  const C = 2 * Math.PI * 27;
  let species = null, svg = null, compact = false;
  let last = null, base = 0, baseAt = 0;

  function render() {
    if (!last) return;
    const sec = last.state === 'running' ? base + (Date.now() - baseAt) / 1000 : base;
    $('#time').textContent = fmt(sec);
    const lap = (sec % 3600) / 3600; // one loop an hour, like the main timer
    const pr = $('#pr');
    // on the hour the ring starts a new lap: jump back to empty instead of winding backwards
    const wrap = lap < (pr._lap || 0) - 0.5;
    if (wrap) pr.style.transition = 'none';
    pr.style.strokeDashoffset = (C * (1 - lap)).toFixed(2);
    if (wrap) { void pr.getBoundingClientRect(); pr.style.transition = ''; }
    pr._lap = lap;
    document.body.classList.toggle('rooted', sec >= 600);
    if (svg) { const g = Tree.growthFor(sec); Tree.setGrowth(svg, g.p, g.g); }
  }

  window.api.on('mini:state', (s) => {
    last = s; base = s.sec; baseAt = Date.now();
    for (const k in s.vars) if (s.vars[k]) document.documentElement.style.setProperty(k, s.vars[k]);
    document.documentElement.style.setProperty('--c', s.color);
    $('#subject').textContent = s.subject || 'Not studying';
    document.body.classList.toggle('paused', s.state === 'paused');
    if (s.species !== species) {
      species = s.species;
      $('#tree-box').innerHTML = Tree.build(species, 'mini');
      svg = $('#tree-box .tree');
      svg.setAttribute('viewBox', '30 50 140 175');
    }
    if (s.state === 'idle') { window.api.miniCommand('expand'); }
    render();
  });
  setInterval(render, 250);

  $('#toggle').onclick = () => window.api.miniCommand('toggle');
  $('#stop').onclick = () => window.api.miniCommand('stop');
  $('#expand').onclick = () => window.api.miniCommand('expand');
  $('#close').onclick = () => window.api.miniCommand('close');
  $('#shrink').onclick = () => {
    compact = !compact;
    document.body.classList.toggle('compact', compact);
    if (compact) window.api.miniResize(232, 50); else window.api.miniResize(310, 96);
  };
  window.api.miniCommand('ready');
})();
