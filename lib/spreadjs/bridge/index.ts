// data — 数据读写查询
export { readRanges } from "./data/read-ranges";
export { writeData } from "./data/write-data";
export { clearCells } from "./data/clear-cells";
export { checkSparseDataConflict, checkRangeHasData, checkRowsColsHaveData } from "./data/check-range-data";
export { searchData } from "./data/search-data";
export { sortRange } from "./data/sort-range";
export { setCell } from "./data/set-cell";
export { autoFill } from "./data/auto-fill";
export { findAndReplace } from "./data/find-and-replace";
export { filterRange } from "./data/filter-range";

// sheet — 工作表与结构
export { getWorkbookMetadata } from "./sheet/get-workbook-metadata";
export { createWorksheet } from "./sheet/create-worksheet";
export { renameWorksheet } from "./sheet/rename-worksheet";
export { deleteWorksheet } from "./sheet/delete-worksheet";
export { insertRowsCols } from "./sheet/insert-rows-cols";
export { deleteRowsCols } from "./sheet/delete-rows-cols";
export { resizeRange } from "./sheet/resize-range";
export { autoFitColumns } from "./sheet/auto-fit-columns";
export { freezePanes } from "./sheet/freeze-panes";
export { changeActiveSheet } from "./sheet/change-active-sheet";
export { copySheet } from "./sheet/copy-sheet";
export { moveSheet } from "./sheet/move-sheet";
export { hideShowSheet } from "./sheet/hide-show-sheet";
export { protectSheet } from "./sheet/protect-sheet";
export { setTabColor } from "./sheet/set-tab-color";

// format — 格式
export { formatRange } from "./format/format-range";
export { getCellFormat } from "./format/get-cell-format";
export { mergeCells } from "./format/merge-cells";

// conditional — 条件格式
export { addHighlightRule, addColorScale, addDataBar, addIconSet } from "./conditional";

// object — 图表、透视表
export { addChart } from "./object/add-chart";
export { addPivotTable } from "./object/add-pivot-table";
export { getAllObjects } from "./object/get-all-objects";
export { modifyChart } from "./object/modify-chart";
export { removeChart } from "./object/remove-chart";
export { modifyPivotTable } from "./object/modify-pivot-table";
export { removePivotTable } from "./object/remove-pivot-table";

// io — 导入导出、上下文捕获、截图
export { importFile } from "./io/import-file";
export { exportFile } from "./io/export-file";
export { captureWorkbookContext } from "./io/capture-workbook-context";
export { takeScreenshot } from "./io/take-screenshot";

// analysis — 计算引擎
export { goalSeek } from "./analysis/goal-seek";
export { traceDependencies } from "./analysis/trace-dependencies";

// validation — 数据验证
export { addValidation, removeValidation, getValidation } from "./validation";

// table — 表格
export { addTable, removeTable, setTableStyle, setTableOption, getTableInfo } from "./table";

// hyperlink — 超链接
export { setHyperlink, removeHyperlink, getHyperlinks } from "./hyperlink";

// cell-type — 单元格类型
export { setCellType, removeCellType, getCellType } from "./cell-type";

// comment — 批注
export { addComment, editComment, removeComment, getComments } from "./comment";

// cell-state — 单元格状态
export { addCellState, removeCellState, getCellStates } from "./cell-state";

// shape — 形状与图片
export { addShape, modifyShape, removeShape, addImage, addPicture } from "./shape";

// slicer — 切片器
export { addSlicer, modifySlicer, removeSlicer } from "./slicer";

export { bridgeT, setBridgeLocale } from "./internal";
