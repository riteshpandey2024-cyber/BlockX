# BlockX

BlockX is a simple, beginner-friendly Flask demonstration app that shows how a Python server (app.py) delivers a web interface and static frontend files.

Run the app to open a demo UI in your browser, interact with the page, and see how the server processes requests and returns results.

This repository includes the essential pieces to explore and extend the demo:

- app.py — the server entry point
- templates — HTML templates used by the app
- static — JavaScript and CSS frontend assets
- ReferancePaper — supporting reference documents and notes

## Features

- Minimal Flask web app structure with `app.py` entry point
- Static frontend assets under `static/` (JavaScript and CSS)
- HTML templates under `templates/` (single-page UI in `index.html`)
- Research/reference material in `ReferancePaper/`

## Tech stack

- Python (3.10+ recommended)
- Flask (web framework)
- Standard HTML/CSS/JavaScript for the frontend

## Repository structure

Top-level layout (important files and folders):

- `app.py` — application entry point (starts the web server)
- `requirements.txt` — Python dependencies
- `templates/` — HTML templates (contains `index.html`)
- `static/` — static assets
	- `main.js` — frontend JavaScript
	- `styles.css` — frontend styles
- `ReferancePaper/` — supporting/reference documents
- `README.md` — this file

## Prerequisites

- Python 3.10 or newer
- Optional: `venv` for an isolated environment




## Reference materials

See the `ReferancePaper/` folder for research materials and supporting documents used while developing or researching the project.



## Demo & Screenshots

Below are illustrative demo images showing the project's workflow and a UI mockup. These are included as SVG placeholders — replace them with real screenshots if you have them.

- Workflow diagram: static/images/demo_workflow_1.svg

	![Workflow diagram](static/images/demo_workflow_1.svg)

- UI mockup / demo screenshot: static/images/demo_workflow_2.svg

	![UI mockup](static/images/demo_workflow_2.svg)

How to replace the images:

1. Add your PNG/JPEG/SVG files to `static/images/` with the same filenames, or update the image paths above.
2. Commit and push the changes; the README will display the updated images on GitHub.

