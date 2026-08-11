(function () {
  const imgGrid = document.getElementById('imgGrid');
  const imgEmpty = document.getElementById('imgEmpty');
  const imgFilters = document.getElementById('imgFilters');
  const videoGrid = document.getElementById('videoGrid');
  const videoEmpty = document.getElementById('videoEmpty');
  const lightbox = document.getElementById('lightbox');
  const lightboxContent = document.getElementById('lightboxContent');
  const lightboxClose = document.getElementById('lightboxClose');

  let currentFilter = 'Tous';
  let allImages = [];

  function openLightbox(item) {
    lightboxContent.innerHTML = '';
    const el = document.createElement('img');
    el.src = item.path;
    el.alt = item.title || '';
    lightboxContent.appendChild(el);
    lightbox.classList.add('open');
  }
  lightboxClose.addEventListener('click', () => lightbox.classList.remove('open'));
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.classList.remove('open'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lightbox.classList.remove('open'); });

  function renderImages() {
    imgGrid.innerHTML = '';
    const list = currentFilter === 'Tous' ? allImages : allImages.filter(i => (i.category || 'Autre') === currentFilter);
    if (list.length === 0) {
      imgGrid.style.display = 'none';
      imgEmpty.style.display = 'block';
      return;
    }
    imgGrid.style.display = 'grid';
    imgEmpty.style.display = 'none';
    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <img src="${item.path}" alt="${item.title || ''}" loading="lazy">
        ${item.category ? `<span class="card-tag">${item.category}</span>` : ''}
        ${item.title ? `<div class="card-title">${item.title}</div>` : ''}
      `;
      card.addEventListener('click', () => openLightbox(item));
      imgGrid.appendChild(card);
    });
  }

  function renderFilters(categories) {
    imgFilters.innerHTML = '';
    const cats = ['Tous', ...categories];
    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (cat === currentFilter ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        currentFilter = cat;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderImages();
      });
      imgFilters.appendChild(btn);
    });
  }

  function renderVideos(videos) {
    videoGrid.innerHTML = '';
    if (!videos || videos.length === 0) {
      videoGrid.style.display = 'none';
      videoEmpty.style.display = 'block';
      return;
    }
    videoGrid.style.display = 'grid';
    videoEmpty.style.display = 'none';
    videos.forEach(v => {
      const card = document.createElement('div');
      card.className = 'vcard';
      card.innerHTML = `
        <video src="${v.path}" controls preload="metadata" playsinline></video>
        <div class="vcard-info">
          <h3>${v.title || 'Sans titre'}</h3>
          ${v.category ? `<span>${v.category}</span>` : ''}
        </div>
      `;
      videoGrid.appendChild(card);
    });
  }

  fetch('data/manifest.json?t=' + Date.now(), { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      allImages = data.images || [];
      const categories = [...new Set(allImages.map(i => i.category).filter(Boolean))];
      if (categories.length > 0) {
        imgFilters.style.display = 'flex';
        renderFilters(categories);
      } else {
        imgFilters.style.display = 'none';
      }
      renderImages();
      renderVideos(data.videos || []);
    })
    .catch(() => {
      imgGrid.style.display = 'none';
      imgEmpty.style.display = 'block';
      videoGrid.style.display = 'none';
      videoEmpty.style.display = 'block';
    });
})();
