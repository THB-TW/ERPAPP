// Format existing and asynchronously rendered ledgers for narrow screens.
(() => {
    function formatTables(root) {
        root.querySelectorAll('table.table').forEach(table => {
            if (!table.closest('.table-responsive') && !table.parentElement.closest('table')) {
                const wrapper=document.createElement('div');
                wrapper.className='table-responsive';
                table.before(wrapper);wrapper.append(table);
            }
            const wrapper=table.closest('.table-responsive');
            if(wrapper && !wrapper.hasAttribute('tabindex')) {
                wrapper.tabIndex=0;wrapper.setAttribute('role','region');
                wrapper.setAttribute('aria-label','明細表格，可橫向捲動');
            }
            table.querySelectorAll('tbody td').forEach(cell=>{
                if(!cell.children.length && /^[-+]?\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*元)?$/.test(cell.textContent.trim())) cell.classList.add('amount-cell');
            });
        });
    }
    const main=document.querySelector('.page-body');
    if(!main) return;
    main.querySelectorAll('.js-budget-target').forEach(button=>button.addEventListener('click',()=>{
        const target=document.querySelector('#fund-to');
        const amount=document.querySelector('#fund-amount');
        if(!target || !amount) return;
        bootstrap.Tab.getOrCreateInstance(document.querySelector('#fund-tab')).show();
        target.value=button.dataset.category;
        amount.value=Number(button.dataset.gap)>0?button.dataset.gap:'';
        amount.focus();
    }));
    formatTables(main);
    let scheduled=false;
    new MutationObserver(()=>{
        if(scheduled) return;
        scheduled=true;
        requestAnimationFrame(()=>{scheduled=false;formatTables(main);});
    }).observe(main,{childList:true,subtree:true});
})();
