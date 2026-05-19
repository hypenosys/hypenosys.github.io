---
layout: home
title: Hypenosys Indie Studio
---

<div class="jumbotron bg-dark text-purple border border-purple shadow-lg mb-5">
  <h1 class="display-4 font-weight-bold">HYPENOSYS</h1>
  <p class="lead text-white">Donde las pesadillas se vuelven código y el arte cobra vida.</p>
  <hr class="my-4 border-purple">
  <p class="text-muted">Desarrollando experiencias únicas con Unreal Engine 5.</p>
</div>

<div class="row">
  <div class="col-lg-8">
    <h2 class="mb-4">🚀 Project Hub & Documentation</h2>
    <div class="card p-4 mb-5 shadow-sm">
      <p>Bienvenido al centro de mando. Aquí encontrarás toda la documentación y guías necesarias para el proyecto.</p>
      {% include auto_tree.html %}
    </div>

    <h2 class="mb-4">⚡ Latest Updates</h2>
    <div class="card p-4 mb-5 shadow-sm">
      <p>Consulta el <a href="{{ '/changelog' | relative_url }}" class="text-purple font-weight-bold">Changelog</a> para estar al día de los commits y cambios en el proyecto.</p>
    </div>
  </div>

  <div class="col-lg-4">
    <h2 class="mb-4">🛠️ Quick Links</h2>
    <div class="list-group shadow-sm">
      <a href="{{ '/guia-ue5-svn' | relative_url }}" class="list-group-item list-group-item-action bg-dark text-white border-purple">
        <i class="fas fa-book mr-2 text-purple"></i> Guía UE5 + SVN
      </a>
      <a href="{{ '/plan_de_arranque' | relative_url }}" class="list-group-item list-group-item-action bg-dark text-white border-purple">
        <i class="fas fa-rocket mr-2 text-purple"></i> Plan de Arranque
      </a>
    </div>
  </div>
</div>

<hr class="my-5 border-purple">

<h2 class="mb-4 text-center">👥 The Dream Team</h2>
{% include team_section.html %}
