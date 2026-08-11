(function () {
  const $ = (id) => document.getElementById(id);
  const cfgOwner = $('cfgOwner'), cfgRepo = $('cfgRepo'), cfgBranch = $('cfgBranch'), cfgToken = $('cfgToken');
  const cfgStatus = $('cfgStatus'), publishStatus = $('publishStatus'), listStatus = $('listStatus');
  const manifestList = $('manifestList');

  const SESSION_KEY = 'windjos_admin_cfg';

  function loadConfig() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const cfg = JSON.parse(raw);
      cfgOwner.value = cfg.owner || '';
      cfgRepo.value = cfg.repo || '';
      cfgBranch.value = cfg.branch || 'main';
      cfgToken.value = cfg.token || '';
    } catch (e) {}
  }

  function saveConfig() {
    const cfg = {
      owner: cfgOwner.value.trim(),
      repo: cfgRepo.value.trim(),
      branch: (cfgBranch.value.trim() || 'main'),
      token: cfgToken.value.trim()
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(cfg));
    cfgStatus.textContent = 'Enregistré pour cette session (effacé à la fermeture de l\'onglet).';
    cfgStatus.className = 'status ok';
    return cfg;
  }

  function getConfig() {
    return {
      owner: cfgOwner.value.trim(),
      repo: cfgRepo.value.trim(),
      branch: (cfgBranch.value.trim() || 'main'),
      token: cfgToken.value.trim()
    };
  }

  $('saveConfig').addEventListener('click', saveConfig);
  $('clearConfig').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    cfgOwner.value = ''; cfgRepo.value = ''; cfgBranch.value = 'main'; cfgToken.value = '';
    cfgStatus.textContent = 'Configuration effacée.';
    cfgStatus.className = 'status';
  });

  loadConfig();

  function api(cfg, path, options = {}) {
    return fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${cfg.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {})
      }
    }).then(async (r) => {
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`${r.status} ${r.statusText} — ${body.slice(0, 300)}`);
      }
      return r.json();
    });
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function getManifest(cfg) {
    try {
      const data = await api(cfg, `/contents/data/manifest.json?ref=${cfg.branch}`);
      const json = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
      return JSON.parse(json);
    } catch (e) {
      return { images: [], videos: [] };
    }
  }

  async function commitFiles(cfg, message, files, manifestAfter) {
    // files: [{path, base64}]  -- media blobs to add. manifestAfter: object to write to data/manifest.json
    const ref = await api(cfg, `/git/refs/heads/${cfg.branch}`);
    const latestCommitSha = ref.object.sha;
    const latestCommit = await api(cfg, `/git/commits/${latestCommitSha}`);
    const baseTreeSha = latestCommit.tree.sha;

    const treeEntries = [];
    for (const f of files) {
      const blob = await api(cfg, '/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: f.base64, encoding: 'base64' })
      });
      treeEntries.push({ path: f.path, mode: '100644', type: 'blob', sha: f.remove ? null : blob.sha });
    }

    const manifestB64 = btoa(unescape(encodeURIComponent(JSON.stringify(manifestAfter, null, 2))));
    const manifestBlob = await api(cfg, '/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: manifestB64, encoding: 'base64' })
    });
    treeEntries.push({ path: 'data/manifest.json', mode: '100644', type: 'blob', sha: manifestBlob.sha });

    const newTree = await api(cfg, '/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
    });

    const newCommit = await api(cfg, '/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: newTree.sha, parents: [latestCommitSha] })
    });

    await api(cfg, `/git/refs/heads/${cfg.branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommit.sha, force: false })
    });
  }

  function sanitize(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  }

  $('publishBtn').addEventListener('click', async () => {
    const cfg = getConfig();
    const btn = $('publishBtn');
    publishStatus.className = 'status pending';
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      publishStatus.textContent = 'Renseigne et enregistre d\'abord la configuration GitHub ci-dessus.';
      publishStatus.className = 'status err';
      return;
    }
    const file = $('itemFile').files[0];
    if (!file) {
      publishStatus.textContent = 'Choisis un fichier à publier.';
      publishStatus.className = 'status err';
      return;
    }
    const type = $('itemType').value;
    const title = $('itemTitle').value.trim();
    const category = $('itemCategory').value.trim();

    btn.disabled = true;
    publishStatus.textContent = 'Lecture du fichier...';

    try {
      const base64 = await fileToBase64(file);
      const folder = type === 'image' ? 'assets/images' : 'assets/videos';
      const path = `${folder}/${Date.now()}-${sanitize(file.name)}`;

      publishStatus.textContent = 'Récupération du contenu existant...';
      const manifest = await getManifest(cfg);
      const entry = { id: String(Date.now()), path, title, category, date: new Date().toISOString() };
      if (type === 'image') manifest.images.push(entry); else manifest.videos.push(entry);

      publishStatus.textContent = 'Publication sur GitHub (peut prendre un moment pour les vidéos)...';
      await commitFiles(cfg, `Ajout: ${title || file.name}`, [{ path, base64 }], manifest);

      publishStatus.textContent = 'Publié. Le site se mettra à jour dans 1 à 2 minutes.';
      publishStatus.className = 'status ok';
      $('itemFile').value = '';
      $('itemTitle').value = '';
      $('itemCategory').value = '';
      loadManifestList();
    } catch (e) {
      publishStatus.textContent = 'Erreur : ' + e.message;
      publishStatus.className = 'status err';
    } finally {
      btn.disabled = false;
    }
  });

  async function deleteEntry(type, entry) {
    const cfg = getConfig();
    if (!confirm(`Supprimer "${entry.title || entry.path}" ?`)) return;
    listStatus.textContent = 'Suppression en cours...';
    listStatus.className = 'status pending';
    try {
      const manifest = await getManifest(cfg);
      manifest[type] = manifest[type].filter(i => i.id !== entry.id);
      await commitFiles(cfg, `Suppression: ${entry.title || entry.path}`, [{ path: entry.path, remove: true, base64: '' }], manifest);
      listStatus.textContent = 'Supprimé.';
      listStatus.className = 'status ok';
      loadManifestList();
    } catch (e) {
      listStatus.textContent = 'Erreur : ' + e.message;
      listStatus.className = 'status err';
    }
  }

  async function loadManifestList() {
    const cfg = getConfig();
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      manifestList.innerHTML = '';
      return;
    }
    listStatus.textContent = 'Chargement...';
    listStatus.className = 'status pending';
    try {
      const manifest = await getManifest(cfg);
      manifestList.innerHTML = '';
      const all = [
        ...manifest.images.map(i => ({ ...i, type: 'images' })),
        ...manifest.videos.map(i => ({ ...i, type: 'videos' }))
      ];
      if (all.length === 0) {
        manifestList.innerHTML = '<p style="color:var(--paper-dim);font-size:13.5px;">Rien de publié pour le moment.</p>';
      } else {
        all.forEach(item => {
          const row = document.createElement('div');
          row.className = 'manifest-row';
          row.innerHTML = `
            <span>${item.title || item.path} <span class="meta">${item.category || ''}</span></span>
            <button class="btn btn-ghost" style="padding:6px 12px;font-size:11px;">Supprimer</button>
          `;
          row.querySelector('button').addEventListener('click', () => deleteEntry(item.type, item));
          manifestList.appendChild(row);
        });
      }
      listStatus.textContent = '';
    } catch (e) {
      listStatus.textContent = 'Erreur de chargement : ' + e.message;
      listStatus.className = 'status err';
    }
  }

  loadManifestList();
})();
