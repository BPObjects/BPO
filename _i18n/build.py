#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Génère les pages d'accueil multilingues à partir de :
  _i18n/index.tpl.html   le gabarit (issu de l'index.html français)
  _i18n/site.json        les textes, une entrée par langue

Produit :
  index.html             français, à la racine (URL canonique du site)
  <lg>/index.html        une page par autre langue
  sitemap.xml            avec les alternates xhtml:link
  robots.txt

Choix de référencement :
  - une URL par langue, indexable séparément ;
  - `hreflang` RÉCIPROQUES : chaque page liste TOUTES les langues, elle-même comprise.
    Google ignore silencieusement un jeu non réciproque ;
  - `x-default` pointe vers la racine ;
  - `canonical` auto-référent (chaque page est sa propre canonique) ;
  - le sélecteur de langue est fait de vrais <a href>, donc explorable.

Usage :  python3 _i18n/build.py
"""
import json, os, re, sys, io

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

def load():
    with io.open(os.path.join(HERE, 'site.json'), encoding='utf-8') as f:
        d = json.load(f)
    with io.open(os.path.join(HERE, 'index.tpl.html'), encoding='utf-8') as f:
        tpl = f.read()
    return d, tpl

def url_for(base, lg, default):
    """URL absolue d'une langue. Le défaut vit à la racine."""
    return base if lg == default else base + lg + '/'

def alternates_block(base, langs, default):
    out = []
    for lg in langs:
        out.append('<link rel="alternate" hreflang="%s" href="%s">' % (lg, url_for(base, lg, default)))
    out.append('<link rel="alternate" hreflang="x-default" href="%s">' % base)
    return '\n'.join(out)

def langnav(base, langs, meta, cur, default):
    """Sélecteur de langue : menu déroulant compact.

    C'est un <details>, pas un <select> : les 13 <a href> sont réellement dans le
    DOM (donc suivis par les robots) et le menu fonctionne sans JavaScript.
    """
    items = []
    for lg in langs:
        name = meta[lg]['name']
        if lg == cur:
            items.append('<span class="ln-cur" aria-current="true" lang="%s">%s</span>' % (lg, name))
        else:
            items.append('<a hreflang="%s" lang="%s" href="%s">%s</a>' %
                         (lg, lg, url_for(base, lg, default), name))
    css = ('<style>'
           # la barre ne doit plus se chevaucher : rien ne passe à la ligne
           '.topbar .wrap{flex-wrap:nowrap;gap:10px;}'
           '.nav-mini{white-space:nowrap;}'
           '.nav-mini a{white-space:nowrap;}'
           '.langnav{position:relative;flex:0 0 auto;margin-left:10px;font-size:12px;}'
           '.langnav>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:6px;'
           'padding:6px 10px;border:1px solid #e2e6ec;border-radius:8px;color:#42505f;'
           'white-space:nowrap;background:#fff;}'
           '.langnav>summary::-webkit-details-marker{display:none;}'
           '.langnav>summary::after{content:"\\25BE";font-size:10px;opacity:.55;}'
           '.langnav>summary:hover{border-color:#ffc79a;color:#0d1526;}'
           '.langnav[open]>summary{border-color:#ff8a3d;color:#0d1526;}'
           '.langnav .ln-list{position:absolute;right:0;top:calc(100% + 6px);z-index:60;background:#fff;'
           'border:1px solid #e2e6ec;border-radius:10px;box-shadow:0 12px 32px rgba(13,21,38,.14);'
           'padding:8px;display:grid;grid-template-columns:repeat(2,minmax(118px,1fr));gap:2px;}'
           '.langnav .ln-list a,.langnav .ln-list .ln-cur{display:block;padding:6px 10px;border-radius:6px;'
           'text-decoration:none;color:#42505f;white-space:nowrap;}'
           '.langnav .ln-list a:hover{background:#fff3e9;color:#e5701c;}'
           '.langnav .ln-list .ln-cur{color:#0d1526;font-weight:600;background:#f4f6f9;}'
           '[dir="rtl"] .langnav .ln-list{right:auto;left:0;}'
           '[dir="rtl"] .langnav{margin-left:0;margin-right:10px;}'
           '@media(max-width:620px){.langnav>summary .ln-name{display:none;}'
           '.langnav .ln-list{grid-template-columns:1fr;}}'
           '</style>')
    globe = ('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
             'stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/>'
             '<path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>')
    return (css +
            '<details class="langnav">'
            '<summary aria-label="Langue">' + globe +
            '<span class="ln-name">' + meta[cur]['name'] + '</span></summary>'
            '<nav class="ln-list" aria-label="Langue">' + ''.join(items) + '</nav>'
            '</details>')

def render(tpl, ctx):
    def sub(m):
        k = m.group(1)
        if k not in ctx:
            raise KeyError('placeholder sans valeur : {{%s}}' % k)
        return ctx[k]
    return re.sub(r'\{\{([a-z0-9_]+)\}\}', sub, tpl)

def sitemap(base, langs, default):
    L = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
         '        xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for lg in langs:
        L.append('  <url>')
        L.append('    <loc>%s</loc>' % url_for(base, lg, default))
        for alt in langs:
            L.append('    <xhtml:link rel="alternate" hreflang="%s" href="%s"/>' % (alt, url_for(base, alt, default)))
        L.append('    <xhtml:link rel="alternate" hreflang="x-default" href="%s"/>' % base)
        L.append('  </url>')
    L.append('</urlset>')
    return '\n'.join(L) + '\n'

def main():
    d, tpl = load()
    base    = d['_base']
    default = d['_default']
    meta    = d['_langs']
    langs   = list(meta.keys())

    if not base.endswith('/'):
        sys.exit('_base doit se terminer par « / »')
    missing = [lg for lg in langs if lg not in d]
    if missing:
        sys.exit('langues déclarées mais sans textes : %s' % ', '.join(missing))

    # jeu de clés de référence = celui du français
    ref = set(d[default].keys())
    for lg in langs:
        got = set(d[lg].keys())
        if got != ref:
            miss, extra = ref - got, got - ref
            sys.exit('clés incohérentes pour « %s » — manquantes: %s | en trop: %s'
                     % (lg, sorted(miss), sorted(extra)))

    alts = alternates_block(base, langs, default)
    written = []
    for lg in langs:
        ctx = dict(d[lg])
        ctx['lang']       = lg
        ctx['dirattr']    = ' dir="rtl"' if meta[lg]['dir'] == 'rtl' else ''
        ctx['oglocale']   = meta[lg]['og']
        ctx['canonical']  = url_for(base, lg, default)
        ctx['base']       = base
        ctx['alternates'] = alts
        ctx['root']       = '' if lg == default else '../'
        ctx['langnav']    = langnav(base, langs, meta, lg, default)

        html = render(tpl, ctx)
        if lg == default:
            path = os.path.join(ROOT, 'index.html')
        else:
            os.makedirs(os.path.join(ROOT, lg), exist_ok=True)
            path = os.path.join(ROOT, lg, 'index.html')
        with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(html)
        written.append((lg, os.path.relpath(path, ROOT), len(html)))

    with io.open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(sitemap(base, langs, default))
    with io.open(os.path.join(ROOT, 'robots.txt'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('User-agent: *\nAllow: /\n\nSitemap: %ssitemap.xml\n' % base)

    print('base :', base, '| défaut :', default, '| langues :', len(langs))
    for lg, p, n in written:
        print('  %-3s -> %-16s %6.1f Ko' % (lg, p, n / 1024))
    print('  sitemap.xml, robots.txt')

if __name__ == '__main__':
    main()
