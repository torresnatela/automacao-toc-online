import preset from "@toc/config/eslint";

export default [
  ...preset,
  {
    // A aplicação do TOConline é Polymer e vive toda em Shadow DOM aberto: o
    // motor CSS do Playwright atravessa shadow roots, o XPath **não**. A
    // proibição estava só num comentário — e um comentário não impede ninguém
    // de escrever um seletor que só falha em produção, contra o portal real.
    files: ["src/toconline/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^(locator|waitForSelector|\\$\\$?|click|fill|textContent)$/] > Literal[value=/^(xpath=|\\/\\/|\\.\\/\\/)/]",
          message:
            "XPath é proibido neste diretório: não atravessa Shadow DOM, e a grelha do TOConline vive três camadas fundo. Use um seletor CSS.",
        },
        {
          selector: "MemberExpression[property.name='xpath']",
          message: "XPath é proibido neste diretório: não atravessa Shadow DOM.",
        },
      ],
    },
  },
];
