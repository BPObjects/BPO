/* ============================================================================
   BPO — PDF → DXF  (bpo-pdf2dxf.js)
   ----------------------------------------------------------------------------
   Lit le TRACÉ VECTORIEL d'une page PDF (plan de géomètre, extrait cadastral,
   export de CAO) et l'écrit en DXF R12, à l'échelle réelle, pour ArchiCAD,
   AutoCAD ou SketchUp. Exporte aussi le plan extrait par « plan scanné ».

   Pourquoi R12 et pourquoi cette structure : un DXF écrit « au plus court »
   (en-tête, calques, entités) est accepté par un lecteur tolérant et REFUSÉ par
   ArchiCAD 28 et AutoCAD 2025 (« fichier endommagé »). Le squelette ci-dessous
   reproduit celui qu'écrit ezdxf pour R12 — VPORT, LTYPE, LAYER, STYLE, VIEW,
   UCS, APPID, DIMSTYLE, BLOCKS $Model_Space/$Paper_Space, poignées —, validé
   par ezdxf.audit() et ouvert dans ArchiCAD le 26/09/2026.

   Pièges connus (tous vus sur le CDC Safran AZUR, 26/09/2026) :
   - les coordonnées des chemins sont dans le repère NON tourné de la page : on
     passe par viewport.transform, qui applique /Rotate et retourne y ;
   - un PDF peint souvent chaque contour deux fois (fond puis cerne) : 52 % de
     doublons sur un plan — on dédoublonne ;
   - les libellés sont des glyphes tracés en courbes : 92 % des tracés font
     moins de 4 mm papier — calque à part, décochable ;
   - l'échelle n'est pas dans le fichier : l'utilisateur la donne (1:N), sinon
     le DXF sort à la taille du papier, en millimètres.

   Dépend de pdf.js (même CDN et même version que le reste de BPO), chargé à la
   demande. Réseau requis. API : window.BPO_pdf2dxf.
   ========================================================================== */
(function (glob) {
  'use strict';

  var CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  var MM = 25.4 / 72;                  // millimètres par point PDF

  function tr(s) { try { return (typeof glob.trI18N === 'function') ? glob.trI18N(s) : s; } catch (e) { return s; } }

  /* ---------- i18n du module : fusionné dans I18N par app.html, après ses propres tables ---------- */
  var I18N = /*I18N-DEBUT*/{"Convertir un PDF en DXF":{"en":"Convert a PDF to DXF","de":"PDF in DXF konvertieren","es":"Convertir un PDF a DXF","it":"Converti un PDF in DXF","pt":"Converter um PDF em DXF","hu":"PDF konvertálása DXF-be","zh":"将 PDF 转换为 DXF","ja":"PDF を DXF に変換","hi":"PDF को DXF में बदलें","ar":"تحويل PDF إلى DXF","ru":"Преобразовать PDF в DXF","uk":"Перетворити PDF на DXF","pl":"Konwertuj PDF na DXF","ro":"Conversie PDF în DXF","sv":"Konvertera PDF till DXF","da":"Konvertér PDF til DXF","fi":"Muunna PDF DXF-muotoon","no":"Konverter PDF til DXF"},"Exporter le plan en DXF":{"en":"Export the plan to DXF","de":"Plan als DXF exportieren","es":"Exportar el plano a DXF","it":"Esporta la planimetria in DXF","pt":"Exportar o plano para DXF","hu":"Terv exportálása DXF-be","zh":"将平面图导出为 DXF","ja":"図面を DXF に書き出し","hi":"प्लान को DXF में निर्यात करें","ar":"تصدير المخطط إلى DXF","ru":"Экспортировать план в DXF","uk":"Експортувати план у DXF","pl":"Eksportuj rzut do DXF","ro":"Export plan în DXF","sv":"Exportera planen som DXF","da":"Eksportér plantegningen som DXF","fi":"Vie pohjapiirustus DXF-muotoon","no":"Eksporter plantegningen som DXF"},"PDF → DXF":{"en":"PDF → DXF","de":"PDF → DXF","es":"PDF → DXF","it":"PDF → DXF","pt":"PDF → DXF","hu":"PDF → DXF","zh":"PDF → DXF","ja":"PDF → DXF","hi":"PDF → DXF","ar":"PDF → DXF","ru":"PDF → DXF","uk":"PDF → DXF","pl":"PDF → DXF","ro":"PDF → DXF","sv":"PDF → DXF","da":"PDF → DXF","fi":"PDF → DXF","no":"PDF → DXF"},"Le tracé vectoriel d'une page, écrit en DXF à l'échelle réelle — pour ArchiCAD, AutoCAD, SketchUp.":{"en":"The vector linework of a page, written to DXF at real-world scale — for ArchiCAD, AutoCAD, SketchUp.","de":"Die Vektorzeichnung einer Seite, als DXF in realer Größe geschrieben — für ArchiCAD, AutoCAD, SketchUp.","es":"El trazado vectorial de una página, escrito en DXF a escala real — para ArchiCAD, AutoCAD, SketchUp.","it":"Il tracciato vettoriale di una pagina, scritto in DXF in scala reale — per ArchiCAD, AutoCAD, SketchUp.","pt":"O traçado vetorial de uma página, escrito em DXF à escala real — para ArchiCAD, AutoCAD, SketchUp.","hu":"Egy oldal vektoros vonalrajza, valós méretben DXF-be írva — ArchiCAD, AutoCAD és SketchUp számára.","zh":"页面的矢量线条，按真实尺寸写入 DXF — 适用于 ArchiCAD、AutoCAD、SketchUp。","ja":"ページのベクター線画を実寸で DXF に書き出します — ArchiCAD、AutoCAD、SketchUp 向け。","hi":"एक पृष्ठ का वेक्टर रेखाचित्र, वास्तविक स्केल पर DXF में लिखा गया — ArchiCAD, AutoCAD, SketchUp के लिए।","ar":"الرسم المتّجهي لصفحة، مكتوب بصيغة DXF بالأبعاد الحقيقية — لبرامج ArchiCAD وAutoCAD وSketchUp.","ru":"Векторный чертёж страницы, записанный в DXF в реальном масштабе — для ArchiCAD, AutoCAD, SketchUp.","uk":"Векторне креслення сторінки, записане в DXF у реальному масштабі — для ArchiCAD, AutoCAD, SketchUp.","pl":"Rysunek wektorowy strony, zapisany w DXF w skali rzeczywistej — dla ArchiCAD, AutoCAD, SketchUp.","ro":"Desenul vectorial al unei pagini, scris în DXF la scară reală — pentru ArchiCAD, AutoCAD, SketchUp.","sv":"Vektorlinjerna på en sida, skrivna som DXF i verklig skala — för ArchiCAD, AutoCAD, SketchUp.","da":"Vektortegningen fra en side, skrevet som DXF i virkelige mål — til ArchiCAD, AutoCAD, SketchUp.","fi":"Sivun vektorigrafiikka kirjoitettuna DXF-muotoon todellisessa mittakaavassa — ArchiCADia, AutoCADia ja SketchUpia varten.","no":"Vektortegningen på en side, skrevet som DXF i virkelige mål — for ArchiCAD, AutoCAD, SketchUp."},"Fichier PDF":{"en":"PDF file","de":"PDF-Datei","es":"Archivo PDF","it":"File PDF","pt":"Ficheiro PDF","hu":"PDF-fájl","zh":"PDF 文件","ja":"PDF ファイル","hi":"PDF फ़ाइल","ar":"ملف PDF","ru":"Файл PDF","uk":"Файл PDF","pl":"Plik PDF","ro":"Fișier PDF","sv":"PDF-fil","da":"PDF-fil","fi":"PDF-tiedosto","no":"PDF-fil"},"Page":{"en":"Page","de":"Seite","es":"Página","it":"Pagina","pt":"Página","hu":"Oldal","zh":"页码","ja":"ページ","hi":"पृष्ठ","ar":"الصفحة","ru":"Страница","uk":"Сторінка","pl":"Strona","ro":"Pagină","sv":"Sida","da":"Side","fi":"Sivu","no":"Side"},"Échelle du dessin 1 :":{"en":"Drawing scale 1:","de":"Zeichnungsmaßstab 1:","es":"Escala del dibujo 1:","it":"Scala del disegno 1:","pt":"Escala do desenho 1:","hu":"Rajz léptéke 1:","zh":"图纸比例 1 :","ja":"図面の縮尺 1 :","hi":"ड्रॉइंग का स्केल 1:","ar":"مقياس الرسم 1:","ru":"Масштаб чертежа 1:","uk":"Масштаб креслення 1:","pl":"Skala rysunku 1:","ro":"Scara desenului 1:","sv":"Ritningens skala 1:","da":"Tegningens målestok 1:","fi":"Piirustuksen mittakaava 1 :","no":"Tegningens målestokk 1:"},"vide = taille du papier":{"en":"empty = paper size","de":"leer = Blattgröße","es":"vacío = tamaño del papel","it":"vuoto = dimensioni del foglio","pt":"vazio = tamanho do papel","hu":"üres = papírméret","zh":"留空 = 纸张尺寸","ja":"空欄 = 用紙サイズ","hi":"खाली = काग़ज़ का आकार","ar":"فارغ = مقاس الورقة","ru":"пусто = размер листа","uk":"порожньо = розмір аркуша","pl":"puste = rozmiar arkusza","ro":"gol = dimensiunea hârtiei","sv":"tomt = pappersstorlek","da":"tom = papirets størrelse","fi":"tyhjä = paperin koko","no":"tomt felt = papirstørrelse"},"Garder les textes (dessinés en courbes : fichier lourd)":{"en":"Keep text (drawn as curves: large file)","de":"Texte behalten (als Kurven gezeichnet: große Datei)","es":"Conservar los textos (dibujados como curvas: archivo pesado)","it":"Conserva i testi (disegnati come curve: file pesante)","pt":"Manter os textos (desenhados em curvas: ficheiro pesado)","hu":"Szövegek megtartása (görbékként rajzolva: nagy fájl)","zh":"保留文字（以曲线绘制：文件较大）","ja":"文字を残す（曲線で描画：ファイルが重くなります）","hi":"टेक्स्ट रखें (वक्रों के रूप में बनाए गए: भारी फ़ाइल)","ar":"الاحتفاظ بالنصوص (مرسومة كمنحنيات: ملف كبير الحجم)","ru":"Сохранить надписи (в кривых: тяжёлый файл)","uk":"Залишити тексти (накреслені кривими: важкий файл)","pl":"Zachowaj teksty (zamienione na krzywe: duży plik)","ro":"Păstrare texte (desenate în curbe: fișier voluminos)","sv":"Behåll texterna (ritade som kurvor: stor fil)","da":"Behold teksterne (tegnet som kurver: stor fil)","fi":"Säilytä tekstit (piirretty käyrinä: suuri tiedosto)","no":"Behold tekstene (tegnet som kurver: stor fil)"},"Garder les aplats de couleur":{"en":"Keep colour fills","de":"Farbflächen behalten","es":"Conservar los rellenos de color","it":"Conserva le campiture di colore","pt":"Manter os preenchimentos de cor","hu":"Színes kitöltések megtartása","zh":"保留颜色填充","ja":"色の塗りつぶしを残す","hi":"रंग भराव रखें","ar":"الاحتفاظ بالمساحات الملوّنة","ru":"Сохранить цветные заливки","uk":"Залишити кольорові заливки","pl":"Zachowaj wypełnienia kolorem","ro":"Păstrare umpluturi colorate","sv":"Behåll färgfyllningarna","da":"Behold farvefladerne","fi":"Säilytä väripinnat","no":"Behold fargeflatene"},"Convertir":{"en":"Convert","de":"Konvertieren","es":"Convertir","it":"Converti","pt":"Converter","hu":"Konvertálás","zh":"转换","ja":"変換","hi":"बदलें","ar":"تحويل","ru":"Преобразовать","uk":"Перетворити","pl":"Konwertuj","ro":"Conversie","sv":"Konvertera","da":"Konvertér","fi":"Muunna","no":"Konverter"},"Lecture de la page…":{"en":"Reading the page…","de":"Seite wird gelesen…","es":"Leyendo la página…","it":"Lettura della pagina…","pt":"A ler a página…","hu":"Az oldal beolvasása…","zh":"正在读取页面…","ja":"ページを読み込み中…","hi":"पृष्ठ पढ़ा जा रहा है…","ar":"جارٍ قراءة الصفحة…","ru":"Чтение страницы…","uk":"Читання сторінки…","pl":"Odczyt strony…","ro":"Citire pagină…","sv":"Läser sidan…","da":"Læser siden…","fi":"Luetaan sivua…","no":"Leser siden…"},"Aucun tracé vectoriel dans cette page : c'est sans doute un scan. Passe par « Importer un plan scanné » ou « Importer cadastre », qui lisent l'image.":{"en":"No vector linework on this page: it is most likely a scan. Use “Import a scanned plan” or “Import cadastre” instead, which read the image.","de":"Keine Vektorzeichnung auf dieser Seite: wahrscheinlich ein Scan. Verwenden Sie „Gescannten Plan importieren“ oder „Kataster importieren“, die das Bild lesen.","es":"Ningún trazado vectorial en esta página: seguramente es un escaneo. Usa «Importar un plano escaneado» o «Importar catastro», que leen la imagen.","it":"Nessun tracciato vettoriale in questa pagina: probabilmente è una scansione. Usa «Importa una planimetria scansionata» o «Importa catasto», che leggono l'immagine.","pt":"Nenhum traçado vetorial nesta página: trata-se provavelmente de uma digitalização. Utilize «Importar um plano digitalizado» ou «Importar cadastro», que leem a imagem.","hu":"Ezen az oldalon nincs vektoros rajz: valószínűleg szkennelt kép. Használd a „Szkennelt terv importálása” vagy a „Kataszter importálása” funkciót, amelyek a képet olvassák be.","zh":"此页面不含矢量线条：很可能是扫描件。请改用“导入扫描的平面图”或“导入地籍图”，两者均可读取图像。","ja":"このページにはベクター線画がありません：おそらくスキャン画像です。画像を読み取る「スキャンした図面を読み込む」または「地籍図を読込」をお使いください。","hi":"इस पृष्ठ में कोई वेक्टर रेखाचित्र नहीं: यह शायद एक स्कैन है। « स्कैन किया गया प्लान आयात करें » या « कैडस्ट्रे आयात » का उपयोग करें, जो छवि पढ़ते हैं।","ar":"لا يوجد رسم متّجهي في هذه الصفحة: الأرجح أنها مسح ضوئي. استخدم «استيراد مخطط ممسوح ضوئياً» أو «استيراد المساحة»، فهما يقرآن الصورة.","ru":"На этой странице нет векторной графики: скорее всего, это скан. Используйте «Импортировать отсканированный план» или «Импорт кадастра» — они читают изображение.","uk":"На цій сторінці немає векторного креслення: ймовірно, це скан. Скористайтеся «Імпортувати відсканований план» або «Імпорт кадастру», які читають зображення.","pl":"Ta strona nie zawiera rysunku wektorowego: to zapewne skan. Skorzystaj z „Importuj zeskanowany rzut” lub „Importuj mapę ewidencyjną”, które odczytują obraz.","ro":"Niciun desen vectorial pe această pagină: este probabil o scanare. Folosiți « Import plan scanat » sau « Import cadastru », care citesc imaginea.","sv":"Inga vektorlinjer på den här sidan: det är troligen en skannad bild. Använd i stället ”Importera skannad planritning” eller ”Importera fastighetskarta”, som läser bilden.","da":"Ingen vektortegning på denne side: det er sandsynligvis en scanning. Brug ”Importér en scannet tegning” eller ”Importér matrikelkort”, som læser billedet.","fi":"Sivulla ei ole vektorigrafiikkaa: se on todennäköisesti skannaus. Käytä toimintoa ”Tuo skannattu pohjapiirustus” tai ”Tuo kiinteistökartta”, jotka lukevat kuvan.","no":"Ingen vektortegning på denne siden: dette er trolig et skannet bilde. Bruk «Importer skannet plantegning» eller «Importer matrikkel», som leser bildet."},"polylignes":{"en":"polylines","de":"Polylinien","es":"polilíneas","it":"polilinee","pt":"polilinhas","hu":"vonallánc","zh":"条多段线","ja":"本のポリライン","hi":"पॉलीलाइन","ar":"خطوط متعددة","ru":"полилиний","uk":"поліліній","pl":"polilinii","ro":"polilinii","sv":"polylinjer","da":"polylinjer","fi":"polyviivaa","no":"polylinjer"},"sommets":{"en":"vertices","de":"Eckpunkte","es":"vértices","it":"vertici","pt":"vértices","hu":"csúcspont","zh":"个顶点","ja":"個の頂点","hi":"शीर्ष","ar":"رؤوس","ru":"вершин","uk":"вершин","pl":"wierzchołków","ro":"vârfuri","sv":"brytpunkter","da":"punkter","fi":"kärkipistettä","no":"knekkpunkter"},"doublons écartés":{"en":"duplicates discarded","de":"Duplikate entfernt","es":"duplicados descartados","it":"duplicati scartati","pt":"duplicados removidos","hu":"kiszűrt duplikátum","zh":"个重复项已剔除","ja":"件の重複を除外","hi":"डुप्लिकेट हटाए गए","ar":"تكرارات مستبعدة","ru":"дубликатов удалено","uk":"дублікатів відкинуто","pl":"odrzuconych duplikatów","ro":"duplicate eliminate","sv":"dubbletter borttagna","da":"dubletter frasorteret","fi":"kaksoiskappaletta poistettu","no":"duplikater fjernet"},"Le DXF est en millimètres : un mur de 10 m fait 10 000 unités. Vérifie une longueur connue à l'import.":{"en":"The DXF is in millimetres: a 10 m wall is 10,000 units. Check a known length on import.","de":"Das DXF ist in Millimetern: Eine Wand von 10 m entspricht 10 000 Einheiten. Prüfen Sie beim Import eine bekannte Länge.","es":"El DXF está en milímetros: un muro de 10 m mide 10 000 unidades. Comprueba una longitud conocida al importar.","it":"Il DXF è in millimetri: un muro di 10 m corrisponde a 10.000 unità. Verifica una lunghezza nota all'importazione.","pt":"O DXF está em milímetros: uma parede de 10 m tem 10 000 unidades. Verifique um comprimento conhecido ao importar.","hu":"A DXF milliméterben van: egy 10 m-es fal 10 000 egység. Importáláskor ellenőrizz egy ismert hosszt.","zh":"DXF 以毫米为单位：10 m 长的墙即为 10000 个单位。导入时请核对一个已知长度。","ja":"DXF の単位はミリメートルです：10 m の壁は 10,000 単位になります。インポート時に既知の長さを確認してください。","hi":"DXF मिलीमीटर में है: 10 मीटर की दीवार 10,000 इकाइयाँ होती है। आयात के समय किसी ज्ञात लंबाई की जाँच करें।","ar":"ملف DXF بالمليمتر: جدار طوله 10 م يساوي 10 000 وحدة. تحقّق من طول معروف عند الاستيراد.","ru":"DXF в миллиметрах: стена длиной 10 м — это 10 000 единиц. Проверьте известную длину при импорте.","uk":"DXF у міліметрах: стіна завдовжки 10 м — це 10 000 одиниць. Перевірте відому довжину під час імпорту.","pl":"DXF jest w milimetrach: ściana o długości 10 m ma 10 000 jednostek. Po zaimportowaniu sprawdź znaną długość.","ro":"DXF-ul este în milimetri: un perete de 10 m are 10 000 de unități. Verificați o lungime cunoscută la import.","sv":"DXF-filen är i millimeter: en vägg på 10 m blir 10 000 enheter. Kontrollera en känd längd vid importen.","da":"DXF'en er i millimeter: en væg på 10 m er 10.000 enheder. Kontrollér en kendt længde ved importen.","fi":"DXF on millimetreissä: 10 m:n seinä on 10 000 yksikköä. Tarkista tunnettu pituus tuonnin yhteydessä.","no":"DXF-en er i millimeter: en vegg på 10 m blir 10 000 enheter. Kontroller en kjent lengde ved import."},"Lance d'abord « Analyser le plan ».":{"en":"Run “Analyse the plan” first.","de":"Starten Sie zuerst „Plan analysieren“.","es":"Ejecuta primero «Analizar el plano».","it":"Avvia prima «Analizza la planimetria».","pt":"Execute primeiro «Analisar o plano».","hu":"Először indítsd el a „Terv elemzése” funkciót.","zh":"请先点击“分析平面图”。","ja":"先に「図面を解析」を実行してください。","hi":"पहले « प्लान का विश्लेषण करें » चलाएँ।","ar":"شغّل أولًا «تحليل المخطط».","ru":"Сначала нажмите «Проанализировать план».","uk":"Спочатку запустіть «Проаналізувати план».","pl":"Najpierw uruchom „Analizuj rzut”.","ro":"Lansați mai întâi « Analiză plan ».","sv":"Kör först ”Analysera planen”.","da":"Kør først ”Analysér plantegningen”.","fi":"Suorita ensin ”Analysoi pohjapiirustus”.","no":"Kjør «Analyser plantegningen» først."},"Format R12 : lu par tous les logiciels de CAO.":{"en":"R12 format: read by all CAD software.","de":"Format R12: von allen CAD-Programmen lesbar.","es":"Formato R12: lo leen todos los programas de CAD.","it":"Formato R12: letto da tutti i software CAD.","pt":"Formato R12: lido por todos os programas de CAD.","hu":"R12 formátum: minden CAD-szoftver beolvassa.","zh":"R12 格式：所有 CAD 软件均可读取。","ja":"R12 形式：すべての CAD ソフトで読み込めます。","hi":"R12 फ़ॉर्मैट: सभी CAD सॉफ़्टवेयर द्वारा पढ़ा जा सकता है।","ar":"صيغة R12: تقرأها جميع برامج CAD.","ru":"Формат R12: читается всеми САПР.","uk":"Формат R12: читається всіма програмами САПР.","pl":"Format R12: odczytywany przez wszystkie programy CAD.","ro":"Format R12: citit de toate programele CAD.","sv":"R12-format: läses av alla CAD-program.","da":"Format R12: kan læses af alle CAD-programmer.","fi":"R12-muoto: kaikki CAD-ohjelmat lukevat sen.","no":"R12-format: leses av alle CAD-programmer."}}/*I18N-FIN*/;
  (function () {
    var E = glob.BPO_I18N_EXT = glob.BPO_I18N_EXT || {};
    for (var k in I18N) { if (!E[k]) E[k] = {}; for (var lg in I18N[k]) { if (E[k][lg] === undefined) E[k][lg] = I18N[k][lg]; } }
  })();

  /* ---------- pdf.js à la demande ---------- */
  function charge() {
    if (glob.pdfjsLib) return Promise.resolve(glob.pdfjsLib);
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = CDN + 'pdf.min.js';
      s.onload = function () {
        try { glob.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN + 'pdf.worker.min.js'; } catch (e) {}
        res(glob.pdfjsLib);
      };
      s.onerror = function () { rej(new Error(tr('pdf.js indisponible (hors ligne ?)'))); };
      document.head.appendChild(s);
    });
  }

  /* ---------- matrices 2D [a,b,c,d,e,f] ---------- */
  function mul(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
            m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function appl(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

  function bezier(pts, p0, p1, p2, p3, fl) {
    var d = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) + Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
          + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
    var n = Math.max(2, Math.min(48, Math.ceil(Math.sqrt(d / Math.max(1e-6, fl)) * 2)));
    for (var i = 1; i <= n; i++) {
      var t = i / n, u = 1 - t;
      pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
  }

  /* ------------------------------------------------------------------------
     Chemins PEINTS d'une page → [{pts, closed, peint:'trait'|'plein'}] en points
     PDF, page telle qu'AFFICHÉE (rotation appliquée), y vers le HAUT.
     ------------------------------------------------------------------------ */
  function cheminsPage(page, opts) {
    opts = opts || {};
    var fleche = opts.fleche || 0.3;
    var vp = page.getViewport({ scale: 1 });        // porte /Rotate ; y vers le bas
    var VT = vp.transform, H = vp.height;
    function P(ctm, x, y) { var d = appl(VT, appl(ctm, x, y)[0], appl(ctm, x, y)[1]); return [d[0], H - d[1]]; }
    return page.getOperatorList().then(function (ol) {
      var OPS = glob.pdfjsLib.OPS, ctm = [1, 0, 0, 1, 0, 0], pile = [], sortie = [];
      var chemin = null, courant = null, depart = null;
      function pousse(closed, peint) {
        if (!chemin) return;
        for (var i = 0; i < chemin.length; i++) {
          var sc = chemin[i]; if (sc.length < 2) continue;
          var a = sc[0], b = sc[sc.length - 1];
          var boucle = closed || (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9);
          sortie.push({ pts: sc, closed: !!boucle, peint: peint });
        }
      }
      for (var k = 0; k < ol.fnArray.length; k++) {
        var fn = ol.fnArray[k], a = ol.argsArray[k];
        switch (fn) {
          case OPS.save: pile.push(ctm.slice()); break;
          case OPS.restore: if (pile.length) ctm = pile.pop(); break;
          case OPS.transform: ctm = mul(ctm, a); break;
          case OPS.constructPath: {
            var ops = a[0], co = a[1], j = 0;
            chemin = []; courant = null;
            for (var q = 0; q < ops.length; q++) {
              var o = ops[q];
              if (o === OPS.moveTo) { courant = [P(ctm, co[j], co[j + 1])]; chemin.push(courant); depart = courant[0]; j += 2; }
              else if (o === OPS.lineTo) { if (!courant) { courant = [depart || [0, 0]]; chemin.push(courant); } courant.push(P(ctm, co[j], co[j + 1])); j += 2; }
              else if (o === OPS.curveTo) {
                if (!courant) { courant = [depart || [0, 0]]; chemin.push(courant); }
                bezier(courant, courant[courant.length - 1], P(ctm, co[j], co[j + 1]), P(ctm, co[j + 2], co[j + 3]), P(ctm, co[j + 4], co[j + 5]), fleche); j += 6;
              }
              else if (o === OPS.curveTo2 || o === OPS.curveTo3) {
                if (!courant) { courant = [depart || [0, 0]]; chemin.push(courant); }
                var c1 = P(ctm, co[j], co[j + 1]), c2 = P(ctm, co[j + 2], co[j + 3]);
                bezier(courant, courant[courant.length - 1], c1, c2, c2, fleche); j += 4;
              }
              else if (o === OPS.closePath) { if (courant && courant.length > 1) courant.push(courant[0].slice()); }
              else if (o === OPS.rectangle) {
                var x = co[j], y = co[j + 1], w = co[j + 2], h = co[j + 3]; j += 4;
                courant = [P(ctm, x, y), P(ctm, x + w, y), P(ctm, x + w, y + h), P(ctm, x, y + h), P(ctm, x, y)];
                chemin.push(courant);
              }
            }
            break;
          }
          case OPS.stroke: case OPS.closeStroke: pousse(fn === OPS.closeStroke, 'trait'); chemin = null; break;
          case OPS.fill: case OPS.eoFill: case OPS.closeFillStroke: case OPS.fillStroke:
          case OPS.eoFillStroke: case OPS.closeEOFillStroke: pousse(true, 'plein'); chemin = null; break;
          case OPS.endPath: chemin = null; break;                 // découpe : ignorée
          default: break;
        }
      }
      return { chemins: sortie, largeur: vp.width, hauteur: vp.height };
    });
  }

  /* ------------------------------------------------------------------------
     Écrivain DXF R12 — squelette d'ezdxf. `polys` : [{pts:[[x,y]…] en mm, closed,
     calque, couleur}] ; rend le texte du fichier.
     ------------------------------------------------------------------------ */
  function versDXF(polys, calques) {
    var L = [], H = 0x100;
    function p(c, v) { L.push((c < 10 ? '  ' : c < 100 ? ' ' : '') + c); L.push(String(v)); }
    function h() { return (H++).toString(16).toUpperCase(); }
    function f(v) { var s = (+v).toFixed(4); return s.indexOf('.') < 0 ? s + '.0' : s.replace(/0+$/, '').replace(/\.$/, '.0'); }
    var mnx = 1e20, mny = 1e20, mxx = -1e20, mxy = -1e20;
    polys.forEach(function (q) { q.pts.forEach(function (pt) {
      if (pt[0] < mnx) mnx = pt[0]; if (pt[0] > mxx) mxx = pt[0]; if (pt[1] < mny) mny = pt[1]; if (pt[1] > mxy) mxy = pt[1]; }); });
    var noms = calques || [{ nom: 'PLAN_TRAIT', couleur: 7 }];

    p(0, 'SECTION'); p(2, 'HEADER');
    p(9, '$ACADVER'); p(1, 'AC1009');
    p(9, '$DWGCODEPAGE'); p(3, 'ANSI_1252');
    p(9, '$INSBASE'); p(10, '0.0'); p(20, '0.0'); p(30, '0.0');
    p(9, '$EXTMIN'); p(10, f(mnx)); p(20, f(mny)); p(30, '0.0');
    p(9, '$EXTMAX'); p(10, f(mxx)); p(20, f(mxy)); p(30, '0.0');
    p(9, '$LIMMIN'); p(10, f(mnx)); p(20, f(mny));
    p(9, '$LIMMAX'); p(10, f(mxx)); p(20, f(mxy));
    p(9, '$ORTHOMODE'); p(70, 0); p(9, '$REGENMODE'); p(70, 1); p(9, '$FILLMODE'); p(70, 1);
    p(9, '$QTEXTMODE'); p(70, 0); p(9, '$MIRRTEXT'); p(70, 1); p(9, '$LTSCALE'); p(40, '1.0');
    p(9, '$ATTMODE'); p(70, 1); p(9, '$TEXTSIZE'); p(40, '2.5'); p(9, '$TRACEWID'); p(40, '1.0');
    p(9, '$TEXTSTYLE'); p(7, 'Standard'); p(9, '$CLAYER'); p(8, '0'); p(9, '$CELTYPE'); p(6, 'ByLayer');
    p(9, '$CECOLOR'); p(62, 256); p(9, '$DIMSCALE'); p(40, '1.0'); p(9, '$DIMASZ'); p(40, '2.5');
    p(9, '$DIMTXT'); p(40, '2.5'); p(9, '$DIMSTYLE'); p(2, 'Standard');
    p(9, '$LUNITS'); p(70, 2); p(9, '$LUPREC'); p(70, 4); p(9, '$AUNITS'); p(70, 0); p(9, '$AUPREC'); p(70, 2);
    p(9, '$MENU'); p(1, '.'); p(9, '$ELEVATION'); p(40, '0.0'); p(9, '$THICKNESS'); p(40, '0.0');
    p(9, '$HANDLING'); p(70, 1); p(9, '$HANDSEED'); p(5, 'HANDSEED');
    p(9, '$UCSNAME'); p(2, ''); p(9, '$UCSORG'); p(10, '0.0'); p(20, '0.0'); p(30, '0.0');
    p(9, '$UCSXDIR'); p(10, '1.0'); p(20, '0.0'); p(30, '0.0'); p(9, '$UCSYDIR'); p(10, '0.0'); p(20, '1.0'); p(30, '0.0');
    p(9, '$WORLDVIEW'); p(70, 1); p(9, '$TILEMODE'); p(70, 1); p(9, '$MAXACTVP'); p(70, 64);
    p(9, '$PLIMMIN'); p(10, '0.0'); p(20, '0.0'); p(9, '$PLIMMAX'); p(10, '420.0'); p(20, '297.0');
    p(9, '$UNITMODE'); p(70, 0); p(9, '$VISRETAIN'); p(70, 1); p(9, '$PLINEGEN'); p(70, 0); p(9, '$PSLTSCALE'); p(70, 1);
    p(0, 'ENDSEC');

    p(0, 'SECTION'); p(2, 'TABLES');
    p(0, 'TABLE'); p(2, 'VPORT'); p(70, 1);
    p(0, 'VPORT'); p(5, h()); p(2, '*Active'); p(70, 0); p(10, '0.0'); p(20, '0.0'); p(11, '1.0'); p(21, '1.0');
    p(12, f((mnx + mxx) / 2)); p(22, f((mny + mxy) / 2)); p(13, '0.0'); p(23, '0.0'); p(14, '0.5'); p(24, '0.5');
    p(15, '0.5'); p(25, '0.5'); p(16, '0.0'); p(26, '0.0'); p(36, '1.0'); p(17, '0.0'); p(27, '0.0'); p(37, '0.0');
    p(40, f(Math.max(1, (mxy - mny) * 1.1))); p(41, '1.34'); p(42, '50.0'); p(43, '0.0'); p(44, '0.0'); p(50, '0.0'); p(51, '0.0');
    p(71, 0); p(72, 1000); p(73, 1); p(74, 3); p(75, 0); p(76, 0); p(77, 0); p(78, 0);
    p(0, 'ENDTAB');
    p(0, 'TABLE'); p(2, 'LTYPE'); p(70, 3);
    ['ByBlock', 'ByLayer', 'Continuous'].forEach(function (n) {
      p(0, 'LTYPE'); p(5, h()); p(2, n); p(70, 0); p(3, ''); p(72, 65); p(73, 0); p(40, '0.0'); });
    p(0, 'ENDTAB');
    p(0, 'TABLE'); p(2, 'LAYER'); p(70, noms.length + 2);
    [{ nom: '0', couleur: 7 }, { nom: 'Defpoints', couleur: 7 }].concat(noms).forEach(function (c) {
      p(0, 'LAYER'); p(5, h()); p(2, c.nom); p(70, 0); p(62, c.couleur || 7); p(6, 'Continuous'); });
    p(0, 'ENDTAB');
    p(0, 'TABLE'); p(2, 'STYLE'); p(70, 1);
    p(0, 'STYLE'); p(5, h()); p(2, 'Standard'); p(70, 0); p(40, '0.0'); p(41, '1.0'); p(50, '0.0'); p(71, 0); p(42, '2.5'); p(3, 'txt'); p(4, '');
    p(0, 'ENDTAB');
    p(0, 'TABLE'); p(2, 'VIEW'); p(70, 0); p(0, 'ENDTAB');
    p(0, 'TABLE'); p(2, 'UCS'); p(70, 0); p(0, 'ENDTAB');
    p(0, 'TABLE'); p(2, 'APPID'); p(70, 1);
    p(0, 'APPID'); p(5, h()); p(2, 'ACAD'); p(70, 0);
    p(0, 'ENDTAB');
    p(0, 'TABLE'); p(2, 'DIMSTYLE'); p(70, 1);
    p(0, 'DIMSTYLE'); p(105, h()); p(2, 'Standard'); p(70, 0); p(3, ''); p(4, ''); p(5, ''); p(6, ''); p(7, '');
    p(40, '1.0'); p(41, '2.5'); p(42, '0.625'); p(43, '3.75'); p(44, '1.25'); p(45, '0.0'); p(46, '0.0'); p(47, '0.0'); p(48, '0.0');
    p(140, '2.5'); p(141, '2.5'); p(142, '0.0'); p(143, '0.03937007874'); p(144, '1.0'); p(145, '0.0'); p(146, '1.0'); p(147, '0.625');
    p(71, 0); p(72, 0); p(73, 0); p(74, 0); p(75, 0); p(76, 0); p(77, 1); p(78, 8);
    p(170, 0); p(171, 3); p(172, 1); p(173, 0); p(174, 0); p(175, 0); p(176, 0); p(177, 0); p(178, 0);
    p(0, 'ENDTAB'); p(0, 'ENDSEC');

    p(0, 'SECTION'); p(2, 'BLOCKS');
    p(0, 'BLOCK'); p(5, h()); p(8, '0'); p(2, '$Model_Space'); p(70, 0); p(10, '0.0'); p(20, '0.0'); p(30, '0.0'); p(3, '$Model_Space'); p(1, '');
    p(0, 'ENDBLK'); p(5, h()); p(8, '0');
    p(0, 'BLOCK'); p(5, h()); p(8, '0'); p(2, '$Paper_Space'); p(70, 0); p(10, '0.0'); p(20, '0.0'); p(30, '0.0'); p(3, '$Paper_Space'); p(1, '');
    p(0, 'ENDBLK'); p(5, h()); p(8, '0');
    p(0, 'ENDSEC');

    p(0, 'SECTION'); p(2, 'ENTITIES');
    polys.forEach(function (q) {
      var pts = q.pts;
      if (q.closed && pts.length > 2) { var a = pts[0], b = pts[pts.length - 1];
        if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) pts = pts.slice(0, -1); }
      if (pts.length < 2) return;
      var cal = q.calque || 'PLAN_TRAIT';
      p(0, 'POLYLINE'); p(5, h()); p(8, cal); if (q.couleur) p(62, q.couleur); p(66, 1);
      p(10, '0.0'); p(20, '0.0'); p(30, '0.0'); p(70, q.closed ? 1 : 0);
      pts.forEach(function (pt) { p(0, 'VERTEX'); p(5, h()); p(8, cal); p(10, f(pt[0])); p(20, f(pt[1])); p(30, '0.0'); p(70, 0); });
      p(0, 'SEQEND'); p(5, h()); p(8, cal);
    });
    p(0, 'ENDSEC'); p(0, 'EOF');
    return L.join('\r\n').replace('HANDSEED', (H + 1).toString(16).toUpperCase()) + '\r\n';
  }

  /* ------------------------------------------------------------------------
     Conversion d'une page : source (File | ArrayBuffer), opts { page, echelle,
     textes, aplats, mini } → { dxf, stats }
     ------------------------------------------------------------------------ */
  function convertir(source, opts) {
    opts = opts || {};
    var ech = MM * (opts.echelle > 0 ? opts.echelle : 1);
    var mini = opts.mini != null ? opts.mini : 0.15;      // mm papier
    var seuilTexte = 4.0;                                   // mm papier : en dessous, c'est un glyphe
    return charge().then(function (lib) {
      var pret = (source instanceof ArrayBuffer) ? Promise.resolve(source) : source.arrayBuffer();
      return pret.then(function (buf) { return lib.getDocument({ data: new Uint8Array(buf) }).promise; });
    }).then(function (pdf) {
      var n = Math.min(Math.max(1, opts.page || 1), pdf.numPages);
      return pdf.getPage(n).then(function (pg) { return cheminsPage(pg, opts); }).then(function (r) {
        var vus = {}, polys = [], st = { page: n, pages: pdf.numPages, lus: r.chemins.length, doublons: 0, jetes: 0, textes: 0, ecrits: 0, sommets: 0,
                                         largeur_mm: +(r.largeur * MM).toFixed(1), hauteur_mm: +(r.hauteur * MM).toFixed(1) };
        r.chemins.forEach(function (c) {
          var pts = c.pts, a = pts[0], b = pts[pts.length - 1];
          var cle = c.peint + '|' + a[0].toFixed(3) + ',' + a[1].toFixed(3) + '|' + pts.length + '|' + b[0].toFixed(3) + ',' + b[1].toFixed(3);
          if (vus[cle]) { st.doublons++; return; } vus[cle] = 1;
          if (c.peint === 'plein' && opts.aplats === false) { st.jetes++; return; }
          var lg = 0, mnx = 1e30, mny = 1e30, mxx = -1e30, mxy = -1e30;
          for (var i = 0; i < pts.length; i++) { if (i) lg += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            if (pts[i][0] < mnx) mnx = pts[i][0]; if (pts[i][0] > mxx) mxx = pts[i][0]; if (pts[i][1] < mny) mny = pts[i][1]; if (pts[i][1] > mxy) mxy = pts[i][1]; }
          if (lg * MM < mini) { st.jetes++; return; }
          var cal = c.peint === 'plein' ? 'PLAN_REMPLISSAGE' : 'PLAN_TRAIT';
          if (Math.hypot(mxx - mnx, mxy - mny) * MM < seuilTexte) { st.textes++; if (opts.textes === false) return; cal = 'PLAN_TEXTE'; }
          polys.push({ pts: pts.map(function (q) { return [q[0] * ech, q[1] * ech]; }), closed: c.closed, calque: cal });
          st.ecrits++; st.sommets += pts.length;
        });
        var dxf = versDXF(polys, [{ nom: 'PLAN_TRAIT', couleur: 7 }, { nom: 'PLAN_REMPLISSAGE', couleur: 8 }, { nom: 'PLAN_TEXTE', couleur: 9 }]);
        st.octets = dxf.length;
        return { dxf: dxf, stats: st };
      });
    });
  }

  /* ------------------------------------------------------------------------
     Plan extrait par « plan scanné » (BPO_P2B) → DXF : enveloppe, murs (deux
     traits parallèles à l'épaisseur), ouvertures, contours des zones. Mètres → mm.
     ------------------------------------------------------------------------ */
  function exporterPlan(plan) {
    var polys = [];
    function mm(p) { return [p[0] * 1000, p[1] * 1000]; }
    if (plan.enveloppe && plan.enveloppe.length > 2) polys.push({ pts: plan.enveloppe.map(mm), closed: true, calque: 'PLAN_ENVELOPPE' });
    (plan.murs || []).forEach(function (m) {
      var a = mm(m.a), b = mm(m.b), e = (m.epaisseur || 0.1) * 1000 / 2;
      var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * e, ny = dx / L * e;
      polys.push({ pts: [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], closed: true,
                   calque: m.facade ? 'PLAN_MUR_FACADE' : 'PLAN_MUR' });
    });
    (plan.ouvertures || []).forEach(function (o) { polys.push({ pts: [mm(o.a), mm(o.b)], closed: false, calque: o.type === 'fenetre' ? 'PLAN_FENETRE' : 'PLAN_PORTE' }); });
    ['bassins', 'terrasses'].forEach(function (k) { (plan[k] || []).forEach(function (z) {
      if (z.contour && z.contour.length > 2) polys.push({ pts: z.contour.map(mm), closed: true, calque: 'PLAN_' + k.toUpperCase() }); }); });
    return versDXF(polys, [{ nom: 'PLAN_ENVELOPPE', couleur: 7 }, { nom: 'PLAN_MUR_FACADE', couleur: 1 }, { nom: 'PLAN_MUR', couleur: 1 },
                           { nom: 'PLAN_FENETRE', couleur: 4 }, { nom: 'PLAN_PORTE', couleur: 4 }, { nom: 'PLAN_BASSINS', couleur: 5 }, { nom: 'PLAN_TERRASSES', couleur: 3 }]);
  }

  function telecharge(nom, texte) {
    if (typeof glob.dlFile === 'function') { glob.dlFile(nom, texte, 'application/dxf'); return; }
    var b = new Blob([texte], { type: 'application/dxf' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = nom; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 200);
  }

  /* ------------------------------------------------------------------------
     Boîte de dialogue
     ------------------------------------------------------------------------ */
  function ouvrir() {
    var doc = document;
    var old = doc.getElementById('bpoP2DDlg'); if (old) old.remove();
    var ov = doc.createElement('div'); ov.id = 'bpoP2DDlg';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font:12px system-ui,Segoe UI,sans-serif;';
    var box = doc.createElement('div');
    box.style.cssText = 'background:var(--bg2,#1d1d1d);color:var(--tx,#e8e9ec);border:1px solid var(--ln,#444);border-radius:8px;padding:16px 18px;width:min(460px,92vw);box-shadow:0 12px 40px rgba(0,0,0,.6);';
    function el(tag, css, txt) { var e = doc.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
    var h = el('div', 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;');
    h.appendChild(el('div', 'font-size:15px;font-weight:600;color:var(--am,#ff8a3d);', tr('PDF → DXF')));
    var x = el('button', 'background:none;border:0;color:inherit;font-size:16px;cursor:pointer;', '✕'); x.onclick = function () { ov.remove(); }; h.appendChild(x);
    box.appendChild(h);
    box.appendChild(el('div', 'font-size:11px;color:var(--dm,#8b92a0);margin-bottom:12px;line-height:1.4;', tr('Le tracé vectoriel d\'une page, écrit en DXF à l\'échelle réelle — pour ArchiCAD, AutoCAD, SketchUp.')));
    function ligne(lab, ctrl) { var r = el('div', 'display:flex;align-items:center;gap:10px;margin:6px 0;'); var l = el('label', 'flex:0 0 150px;', lab); r.appendChild(l); r.appendChild(ctrl); box.appendChild(r); return r; }
    var inF = el('input'); inF.type = 'file'; inF.accept = '.pdf,application/pdf'; inF.style.cssText = 'flex:1;font-size:11px;';
    ligne(tr('Fichier PDF'), inF);
    var inP = el('input'); inP.type = 'number'; inP.min = 1; inP.value = 1; inP.style.cssText = 'width:80px;padding:4px;';
    ligne(tr('Page'), inP);
    var inE = el('input'); inE.type = 'number'; inE.min = 1; inE.step = 'any'; inE.placeholder = '200'; inE.style.cssText = 'width:100px;padding:4px;';
    var wrapE = el('div', 'flex:1;display:flex;align-items:center;gap:8px;'); wrapE.appendChild(inE);
    wrapE.appendChild(el('span', 'font-size:10px;color:var(--dm,#8b92a0);', tr('vide = taille du papier')));
    ligne(tr('Échelle du dessin 1 :'), wrapE);
    function coche(lab, def) { var r = el('label', 'display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11px;cursor:pointer;'); var c = el('input'); c.type = 'checkbox'; c.checked = !!def; r.appendChild(c); r.appendChild(el('span', '', lab)); box.appendChild(r); return c; }
    var ckT = coche(tr('Garder les textes (dessinés en courbes : fichier lourd)'), false);
    var ckA = coche(tr('Garder les aplats de couleur'), true);
    var bGo = el('button', 'margin-top:10px;width:100%;padding:8px;border-radius:6px;border:1px solid var(--am,#ff8a3d);background:var(--am,#ff8a3d);color:#151515;font-weight:600;cursor:pointer;', tr('Convertir'));
    box.appendChild(bGo);
    box.appendChild(el('div', 'font-size:9.5px;color:var(--dm,#8b92a0);margin-top:4px;', tr('Format R12 : lu par tous les logiciels de CAO.')));
    var msg = el('div', 'font-size:11px;margin-top:10px;line-height:1.5;min-height:18px;'); box.appendChild(msg);
    ov.appendChild(box); doc.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    inF.onchange = function () { bGo.disabled = !inF.files.length; };
    bGo.disabled = true;
    bGo.onclick = function () {
      var f = inF.files && inF.files[0]; if (!f) return;
      msg.style.color = ''; msg.textContent = tr('Lecture de la page…'); bGo.disabled = true;
      var ech = parseFloat(inE.value); if (!(ech > 0)) ech = 0;
      convertir(f, { page: parseInt(inP.value, 10) || 1, echelle: ech, textes: ckT.checked, aplats: ckA.checked }).then(function (r) {
        bGo.disabled = false;
        if (!r.stats.ecrits) { msg.style.color = '#ff6b6b'; msg.textContent = tr('Aucun tracé vectoriel dans cette page : c\'est sans doute un scan. Passe par « Importer un plan scanné » ou « Importer cadastre », qui lisent l\'image.'); return; }
        var nom = f.name.replace(/\.pdf$/i, '') + (r.stats.pages > 1 ? '-p' + r.stats.page : '') + '.dxf';
        telecharge(nom, r.dxf);
        msg.innerHTML = '<b>' + nom + '</b> — ' + r.stats.ecrits.toLocaleString() + ' ' + tr('polylignes') + ' · ' + r.stats.sommets.toLocaleString() + ' ' + tr('sommets')
          + ' · ' + Math.round(r.stats.octets / 1024).toLocaleString() + ' Ko · ' + r.stats.doublons.toLocaleString() + ' ' + tr('doublons écartés')
          + '<br><span style="color:var(--dm,#8b92a0)">' + tr('Le DXF est en millimètres : un mur de 10 m fait 10 000 unités. Vérifie une longueur connue à l\'import.') + '</span>';
      }).catch(function (e) { bGo.disabled = false; msg.style.color = '#ff6b6b'; msg.textContent = (e && e.message) || String(e); });
    };
  }

  glob.BPO_pdf2dxf = { convertir: convertir, cheminsPage: cheminsPage, versDXF: versDXF, exporterPlan: exporterPlan, ouvrir: ouvrir, telecharge: telecharge };
})(window);
