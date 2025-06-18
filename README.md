# Applet Repository for GitHub Pages Integration

This repository hosts a collection of web applets intended to be uploaded and served via GitHub Pages. These applets are designed specifically to be embedded into your blog using iframes, allowing seamless integration and interactive functionality directly within your posts.

## Structure

Each applet is contained within its own directory. The recommended structure is:

```
repo-root/
├── applet-one/
│   ├── index.html
│   ├── script.js
│   └── style.css
├── applet-two/
│   ├── index.html
│   └── ...
└── README.md
```

## Deploying to GitHub Pages

1. **Commit & Push:**

   Commit your applets to this repository, ensuring each has its own directory and a main `index.html` file.

2. **Activate GitHub Pages:**

   * Navigate to your repository on GitHub.
   * Go to **Settings > Pages**.
   * Set the source to your desired branch (usually `main`) and click **Save**.

3. **Embedding via iframe:**

   Once deployed, embed an applet into your blog by using an iframe. Example:

   ```html
   <iframe src="https://your-github-username.github.io/repo-name/applet-one/" width="600" height="400"></iframe>
   ```

   Replace `your-github-username`, `repo-name`, and `applet-one` with your GitHub username, repository name, and desired applet directory, respectively.

## Development Tips

* Always include responsive design considerations to ensure compatibility with different screen sizes.
* Test your iframe integrations in your blog posts for optimal user experience.
* Ensure your scripts and resources have correct relative paths.

## Contributing

Feel free to contribute by adding new applets or improving existing ones. Simply fork, make your changes, and submit a pull request!