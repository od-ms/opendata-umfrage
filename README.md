# opendata-umfrage
Ein kleines Umfrage-Tool für das Stadtbücherei-Foyer

## Neue Umfragen erstellen

* Datei anlegen: data/questionsX.yml 
* Umfrage starten mit: https://umfrage.domain.test/umfrage.html?questions=X -> dann wird das question set nr X geladen.
* Parallel lässt sich das Dashboard so aufrufen:  https://umfrage.domain.test/dashboard.html?questions=X

## Folien

PDF-Präsentation in einzelne PNGs (eins pro Seite) umwandeln:
```bash
pdftoppm -rx 300 -ry 300 -png pdfdateiname.pdf outputdateiname
```

## Quellcode

Ein Teil der Software ist "vibegecoded".

Prompt: 

```markdown
a web application that runs with a docker-compose file. 
the web frontend consist of two pages: 
1) a page where a random question with two possible answers appears to the user. the user can press keys 1 or 2 to answer the question. then the next question is shown. this repeats endlessly. the question is read randomly from a yaml file that contains for every question: category, question, answer1, answer2. 
2) a page where a dashboard is displayed, that shows some diagrams about the questions, e.g.: a) how many questions have been answered ever with answer 1 or 2, b) a timeline that shows the number of answers per quarter hour, c) a few diagrams for selected questions TBD.
the application should use a simple onefile database like sqlite. it should be written in node js with react. the frontend style framework should be bootstrap.
```