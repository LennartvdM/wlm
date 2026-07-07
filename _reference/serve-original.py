#!/usr/bin/env python3
"""Serveer de oude WordPress-mirror uit de git-historie, als visuele referentie.

De mirror is met een Windows-downloader gemaakt: bestandsnamen staan in
kleine letters op schijf, terwijl de HTML ernaar verwijst met hoofdletters
(bijv. Wilma-6.png). Op een hoofdlettergevoelige server geeft dat 404's en
ontbreken alle afbeeldingen. Deze server lost paden hoofdletterongevoelig op.

Gebruik:
    git archive 46f944f | tar -x -C /tmp/wlm-origineel
    python3 _reference/serve-original.py /tmp/wlm-origineel
    # open http://localhost:8714/index.htm
"""
import http.server, os, sys, urllib.parse

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')

class CaseInsensitive(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = urllib.parse.unquote(path.split('?', 1)[0].split('#', 1)[0])
        parts = [p for p in path.split('/') if p and p != '..']
        cur = ROOT
        for p in parts:
            if not os.path.isdir(cur):
                break
            entries = {e.lower(): e for e in os.listdir(cur)}
            cur = os.path.join(cur, entries.get(p.lower(), p))
        return cur

if __name__ == '__main__':
    print(f'Serveert {ROOT} op http://localhost:8714/index.htm')
    http.server.ThreadingHTTPServer(('', 8714), CaseInsensitive).serve_forever()
