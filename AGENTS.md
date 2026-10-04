# AGENTS.md

项目约定（会被 mini-code 每次启动自动注入到系统提示）：

- 修改文件前先 `read_file` 了解现状；编辑优先用 `edit_file` 而非整文件重写
- 路径一律使用相对当前目录的相对路径
- 探索代码优先用 `glob` / `grep`，避免盲目 `list_dir` 整树遍历
- 3 步以上的任务先用 `todo_write` 列计划，每完成一步立刻更新状态
- 回答简洁，用中文；代码改动说明改了什么即可，不要复述整个文件
- 提交前跑 `npm run check`；需要真机验证跑 `npm run e2e`（需 tmux）
