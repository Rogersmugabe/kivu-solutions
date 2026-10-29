# Kivu Solutions UI Audit Report

Generated: 2026-10-29T16:42:47.536Z
Total Controls & Surfaces Audited: 280
Bound: 280 | Unbound: 0

| Kind | ID | Label / Context | Handler Evidence | Status |
|---|---|---|---|---|
| button | `pwaInstallBtn` | Install app | referenced by #pwaInstallBtn in JS | ✅ |
| button | `pwaInstallDismiss` | ✕ | referenced by #pwaInstallDismiss in JS | ✅ |
| button | `loginTab` | Login | referenced by #loginTab in JS | ✅ |
| button | `signupTab` | Create account | referenced by #signupTab in JS | ✅ |
| button | `ownerLoginMode` | Owner / Email | referenced by #ownerLoginMode in JS; inside form #loginForm handled in JS | ✅ |
| button | `staffLoginMode` | Staff / Phone | referenced by #staffLoginMode in JS; inside form #loginForm handled in JS | ✅ |
| button | `(no id)` | Login | inside form #loginForm handled in JS | ✅ |
| button | `forgotPasswordBtn` | Forgot password? | referenced by #forgotPasswordBtn in JS; inside form #loginForm handled in JS | ✅ |
| button | `ownerSignupMode` | New business | referenced by #ownerSignupMode in JS; inside form #signupForm handled in JS | ✅ |
| button | `staffSignupMode` | Join as staff | referenced by #staffSignupMode in JS; inside form #signupForm handled in JS | ✅ |
| button | `(no id)` | Create account | inside form #signupForm handled in JS | ✅ |
| button | `(no id)` | Overview | [data-page="dashboard"] | ✅ |
| button | `(no id)` | Sales | [data-page="sales"] | ✅ |
| button | `hospitalityNav` | Tables & Orders | [data-page="hospitality"]; referenced by #hospitalityNav in JS | ✅ |
| button | `(no id)` | Inventory | [data-page="inventory"] | ✅ |
| button | `(no id)` | Customers | [data-page="customers"] | ✅ |
| button | `(no id)` | Suppliers | [data-page="suppliers"] | ✅ |
| button | `(no id)` | Expenses | [data-page="expenses"] | ✅ |
| button | `(no id)` | Employees | [data-page="employees"] | ✅ |
| button | `(no id)` | Shifts | [data-page="shifts"] | ✅ |
| button | `(no id)` | Reports | [data-page="reports"] | ✅ |
| button | `(no id)` | Controls | [data-page="controls"] | ✅ |
| button | `(no id)` | Subscription | [data-page="subscription"] | ✅ |
| button | `(no id)` | Settings | [data-page="settings"] | ✅ |
| button | `dukaAdminNav` | Platinum Tech Admin | [data-page="dukaadmin"]; referenced by #dukaAdminNav in JS | ✅ |
| button | `logoutBtn` | Logout | referenced by #logoutBtn in JS | ✅ |
| button | `menuBtn` | ☰ | referenced by #menuBtn in JS | ✅ |
| button | `offlineQueueBtn` | Offline sales 0 | referenced by #offlineQueueBtn in JS | ✅ |
| button | `modeSwitchBtn` | Platinum Tech Admin | referenced by #modeSwitchBtn in JS | ✅ |
| button | `notificationsBtn` | 🔔 0 | referenced by #notificationsBtn in JS | ✅ |
| button | `changePinBtn` | Change PIN | referenced by #changePinBtn in JS | ✅ |
| button | `quickSaleBtn` | + New sale F2 | referenced by #quickSaleBtn in JS | ✅ |
| button | `topLogoutBtn` | Sign out | referenced by #topLogoutBtn in JS | ✅ |
| button | `(no id)` | 🔄 Refresh | onclick="refresh()" | ✅ |
| button | `(no id)` | ＋ + New POS Sale F2 Fast counter checkou | [data-open="saleModal"] | ✅ |
| button | `(no id)` | 📦 Add Stock Replenish units | [data-open="stockModal"] | ✅ |
| button | `(no id)` | 💸 Add Expense Log cash outflow | [data-open="expenseModal"] | ✅ |
| button | `(no id)` | 📝 Add Credit "Amadeni" debtor record | [data-open="creditModal"] | ✅ |
| button | `(no id)` | View sales → | onclick="showPage(" | ✅ |
| button | `(no id)` | Manage shifts → | onclick="showPage(" | ✅ |
| button | `(no id)` | All inventory → | onclick="showPage(" | ✅ |
| button | `(no id)` | Debtors ledger → | onclick="showPage(" | ✅ |
| button | `(no id)` | + Add Stock | [data-open="stockModal"] | ✅ |
| button | `(no id)` | + Supplier Purchase | [data-open="purchaseModal"] | ✅ |
| button | `editPlatformStatusBtn` | [icon] | referenced by #editPlatformStatusBtn in JS | ✅ |
| button | `clearSalesSearchBtn` | ✕ | referenced by #clearSalesSearchBtn in JS | ✅ |
| button | `(no id)` | Export CSV | onclick="exportSalesCsv()" | ✅ |
| button | `(no id)` | + New POS Sale F2 | [data-open="saleModal"] | ✅ |
| button | `(no id)` | All Time | onclick="setSalesDateFilter(" | ✅ |
| button | `(no id)` | Today | onclick="setSalesDateFilter(" | ✅ |
| button | `(no id)` | Yesterday | onclick="setSalesDateFilter(" | ✅ |
| button | `(no id)` | Last 7 Days | onclick="setSalesDateFilter(" | ✅ |
| button | `recipeBtn` | Recipes | referenced by #recipeBtn in JS | ✅ |
| button | `newTableBtn` | + Table | referenced by #newTableBtn in JS | ✅ |
| button | `newTabBtn` | + Open bill | referenced by #newTabBtn in JS | ✅ |
| button | `wastageBtn` | Record wastage | referenced by #wastageBtn in JS | ✅ |
| button | `clearInventorySearchBtn` | ✕ | referenced by #clearInventorySearchBtn in JS | ✅ |
| button | `importDataBtn` | Import CSV | referenced by #importDataBtn in JS | ✅ |
| button | `stockAdjustBtn` | Adjust stock | referenced by #stockAdjustBtn in JS | ✅ |
| button | `(no id)` | + Add product | [data-open="productModal"] | ✅ |
| button | `(no id)` | All Products | onclick="filterInventoryStatus(" | ✅ |
| button | `(no id)` | In Stock | onclick="filterInventoryStatus(" | ✅ |
| button | `(no id)` | ⚠️ Low Stock | onclick="filterInventoryStatus(" | ✅ |
| button | `(no id)` | 🚫 Out of Stock | onclick="filterInventoryStatus(" | ✅ |
| button | `clearSupplierSearchBtn` | ✕ | referenced by #clearSupplierSearchBtn in JS | ✅ |
| button | `(no id)` | + Supplier | [data-open="supplierModal"] | ✅ |
| button | `(no id)` | + Record purchase | [data-open="purchaseModal"] | ✅ |
| button | `clearExpensesSearchBtn` | ✕ | referenced by #clearExpensesSearchBtn in JS | ✅ |
| button | `(no id)` | + Record expense | [data-open="expenseModal"] | ✅ |
| button | `clearCustomerSearchBtn` | ✕ | referenced by #clearCustomerSearchBtn in JS | ✅ |
| button | `(no id)` | + Add customer | [data-open="customerModal"] | ✅ |
| button | `inviteStaffBtn` | + Invite staff | [data-open="staffInviteModal"] | ✅ |
| button | `pettyCashBtn` | − Petty Cash Payout | referenced by #pettyCashBtn in JS | ✅ |
| button | `printCurrentShiftZBtn` | 🖨️ Shift Z-Report | referenced by #printCurrentShiftZBtn in JS | ✅ |
| button | `openShiftBtn` | Open shift | referenced by #openShiftBtn in JS | ✅ |
| button | `closeShiftBtn` | Close shift | referenced by #closeShiftBtn in JS | ✅ |
| button | `accountantExportBtn` | Accountant CSV | referenced by #accountantExportBtn in JS | ✅ |
| button | `exportCsvBtn` | Export data | referenced by #exportCsvBtn in JS | ✅ |
| button | `exportBackupBtn` | Backup JSON | referenced by #exportBackupBtn in JS | ✅ |
| button | `backToShopBtn` | ← My Shop | referenced by #backToShopBtn in JS | ✅ |
| button | `(no id)` | Add note | inside form #supportNoteForm handled in JS | ✅ |
| button | `(no id)` | Create ticket | inside form #supportTicketForm handled in JS | ✅ |
| button | `suspendShopBtn` | Suspend shop | referenced by #suspendShopBtn in JS | ✅ |
| button | `reactivateShopBtn` | Reactivate shop | referenced by #reactivateShopBtn in JS | ✅ |
| button | `confirmPaymentBtn` | Confirm payment | referenced by #confirmPaymentBtn in JS | ✅ |
| button | `onboardingStatusBtn` | Change onboarding status | referenced by #onboardingStatusBtn in JS | ✅ |
| button | `featureFlagBtn` | Feature flag | referenced by #featureFlagBtn in JS | ✅ |
| button | `addAdminBtn` | + Add / update admin | referenced by #addAdminBtn in JS | ✅ |
| button | `generateExpiryAlertsBtn` | Generate expiry alerts | referenced by #generateExpiryAlertsBtn in JS | ✅ |
| button | `billingMonthlyBtn` | Monthly Billing | onclick="toggleBillingCycle("; referenced by #billingMonthlyBtn in JS | ✅ |
| button | `billingAnnualBtn` | Annual Billing Save ~20% · 2 Months Free | onclick="toggleBillingCycle("; referenced by #billingAnnualBtn in JS | ✅ |
| button | `(no id)` | Request Kivu Lite | [data-plan="basic"] | ✅ |
| button | `(no id)` | Request Kivu Business | [data-plan="business"] | ✅ |
| button | `(no id)` | Request Kivu Control | [data-plan="control"] | ✅ |
| button | `(no id)` | Request Kivu Pro | [data-plan="pro"] | ✅ |
| button | `(no id)` | Request One-Time | [data-plan="one_time"] | ✅ |
| button | `(no id)` | Save settings | submit button for form #settingsForm | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #supplierForm handled in JS | ✅ |
| button | `(no id)` | Save supplier | inside form #supplierForm handled in JS | ✅ |
| button | `(no id)` | ⌂Home | [data-mobile-page="dashboard"] | ✅ |
| button | `(no id)` | ＋Sell | [data-mobile-page="sales"] | ✅ |
| button | `(no id)` | ▦Stock | [data-mobile-page="inventory"] | ✅ |
| button | `(no id)` | ☰More | [data-mobile-more="1"] | ✅ |
| button | `addPurchaseItemBtn` | + Add another product | referenced by #addPurchaseItemBtn in JS; inside form #purchaseForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #purchaseForm handled in JS | ✅ |
| button | `(no id)` | Receive stock & save purchase | inside form #purchaseForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #supplierPaymentForm handled in JS | ✅ |
| button | `(no id)` | Record payment | inside form #supplierPaymentForm handled in JS | ✅ |
| button | `scanProductBarcodeBtn` | 📷 Scan | referenced by #scanProductBarcodeBtn in JS; inside form #productForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #productForm handled in JS | ✅ |
| button | `(no id)` | Save | inside form #productForm handled in JS | ✅ |
| button | `scanEditProductBarcodeBtn` | 📷 Scan | referenced by #scanEditProductBarcodeBtn in JS; inside form #editProductForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #editProductForm handled in JS | ✅ |
| button | `(no id)` | Save changes | inside form #editProductForm handled in JS | ✅ |
| button | `scanStockProductBtn` | 📷 Scan product | referenced by #scanStockProductBtn in JS; inside form #stockForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #stockForm handled in JS | ✅ |
| button | `(no id)` | Save | inside form #stockForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #hospitalityTableForm handled in JS | ✅ |
| button | `(no id)` | Save table | inside form #hospitalityTableForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #hospitalityTabForm handled in JS | ✅ |
| button | `(no id)` | Open bill | inside form #hospitalityTabForm handled in JS | ✅ |
| button | `requestComplimentaryBtn` | Request complimentary | referenced by #requestComplimentaryBtn in JS; inside form #hospitalityOrderForm handled in JS | ✅ |
| button | `sendHospitalityOrderBtn` | Send order | referenced by #sendHospitalityOrderBtn in JS; inside form #hospitalityOrderForm handled in JS | ✅ |
| button | `addHospitalityItemBtn` | + Add item | referenced by #addHospitalityItemBtn in JS; inside form #hospitalityOrderForm handled in JS | ✅ |
| button | `settleHospitalityBtn` | Settle bill | referenced by #settleHospitalityBtn in JS; inside form #hospitalityOrderForm handled in JS | ✅ |
| button | `(no id)` | Close | cancel-btn dialog closer; inside form #hospitalityOrderForm handled in JS | ✅ |
| button | `addHospitalityPaymentBtn` | + Split payment | referenced by #addHospitalityPaymentBtn in JS; inside form #hospitalityPaymentForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #hospitalityPaymentForm handled in JS | ✅ |
| button | `(no id)` | Close bill & receipt | inside form #hospitalityPaymentForm handled in JS | ✅ |
| button | `addRecipeRowBtn` | + Ingredient | referenced by #addRecipeRowBtn in JS; inside form #hospitalityRecipeForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #hospitalityRecipeForm handled in JS | ✅ |
| button | `(no id)` | Save recipe | inside form #hospitalityRecipeForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #hospitalityWastageForm handled in JS | ✅ |
| button | `(no id)` | Record & deduct stock | inside form #hospitalityWastageForm handled in JS | ✅ |
| button | `parkCartBtn` | ⏸ Hold cart | referenced by #parkCartBtn in JS; inside form #saleForm handled in JS | ✅ |
| button | `viewParkedCartsBtn` | 📋 Held (0) | referenced by #viewParkedCartsBtn in JS; inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | ✕ | cancel-btn dialog closer; inside form #saleForm handled in JS | ✅ |
| button | `clearSaleSearchBtn` | ✕ | referenced by #clearSaleSearchBtn in JS; inside form #saleForm handled in JS | ✅ |
| button | `scanSaleBarcodeBtn` | 📷 Scan | referenced by #scanSaleBarcodeBtn in JS; inside form #saleForm handled in JS | ✅ |
| button | `addSaleItemBtn` | + Add to cart | referenced by #addSaleItemBtn in JS; inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | Clear cart | onclick="resetSaleCart()"; inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | 💵 Cash | inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | 📱 MoMo | inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | 🏦 Bank | inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | 📝 Credit | inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | 🔀 Split | inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | Exact | inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | +500 | inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | +1,000 | inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | +2,000 | inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | +5,000 | inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | +10,000 | inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | +20,000 | inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | +50,000 | inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #saleForm handled in JS | ✅ |
| button | `completeSaleBtn` | Complete sale | referenced by #completeSaleBtn in JS; inside form #saleForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #expenseForm handled in JS | ✅ |
| button | `(no id)` | Save expense | inside form #expenseForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #creditForm handled in JS | ✅ |
| button | `(no id)` | Save | inside form #creditForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #customerForm handled in JS | ✅ |
| button | `(no id)` | Save | inside form #customerForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #staffInviteForm handled in JS | ✅ |
| button | `(no id)` | Create invite | inside form #staffInviteForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #openShiftForm handled in JS | ✅ |
| button | `(no id)` | Open shift | inside form #openShiftForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #closeShiftForm handled in JS | ✅ |
| button | `(no id)` | Close shift | inside form #closeShiftForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #importDataForm handled in JS | ✅ |
| button | `(no id)` | Import | inside form #importDataForm handled in JS | ✅ |
| button | `barcodeCameraSwitchBtn` | Switch camera | referenced by #barcodeCameraSwitchBtn in JS | ✅ |
| button | `barcodeCameraCloseBtn` | Cancel | referenced by #barcodeCameraCloseBtn in JS | ✅ |
| button | `(no id)` | Close | cancel-btn dialog closer | ✅ |
| button | `printReceiptBtn` | Print receipt | referenced by #printReceiptBtn in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #voidSaleForm handled in JS | ✅ |
| button | `(no id)` | Continue | inside form #voidSaleForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #stockAdjustForm handled in JS | ✅ |
| button | `(no id)` | Save adjustment | inside form #stockAdjustForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #changePinForm handled in JS | ✅ |
| button | `(no id)` | Change PIN | inside form #changePinForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #editCustomerForm handled in JS | ✅ |
| button | `(no id)` | Save changes | inside form #editCustomerForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #editSupplierForm handled in JS | ✅ |
| button | `(no id)` | Save changes | inside form #editSupplierForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #adminPaymentForm handled in JS | ✅ |
| button | `(no id)` | Confirm payment | inside form #adminPaymentForm handled in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #adminUserForm handled in JS | ✅ |
| button | `(no id)` | Save admin | inside form #adminUserForm handled in JS | ✅ |
| button | `markAllReadBtn` | Mark all read | onclick="markAllNotificationsRead()"; referenced by #markAllReadBtn in JS | ✅ |
| button | `(no id)` | ✕ | cancel-btn dialog closer | ✅ |
| button | `(no id)` | Close | cancel-btn dialog closer | ✅ |
| button | `(no id)` | Not now | cancel-btn dialog closer | ✅ |
| button | `upgradeGoBtn` | View plans | referenced by #upgradeGoBtn in JS | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #creditRepaymentForm handled in JS | ✅ |
| button | `(no id)` | Record Repayment | inside form #creditRepaymentForm handled in JS | ✅ |
| button | `whatsappReminderBtn` | 💬 WhatsApp Reminder | referenced by #whatsappReminderBtn in JS | ✅ |
| button | `printLedgerBtn` | 🖨️ Print Statement | referenced by #printLedgerBtn in JS | ✅ |
| button | `(no id)` | Close | cancel-btn dialog closer | ✅ |
| button | `(no id)` | Cancel | cancel-btn dialog closer; inside form #pettyCashForm handled in JS | ✅ |
| button | `(no id)` | Payout from Drawer | inside form #pettyCashForm handled in JS | ✅ |
| button | `(no id)` | Close | cancel-btn dialog closer | ✅ |
| button | `printZReportBtn` | 🖨️ Print 80mm Z-Report | referenced by #printZReportBtn in JS | ✅ |
| button | `(no id)` | Close | cancel-btn dialog closer | ✅ |
| button | `confirmCancelBtn` | Cancel | cancel-btn dialog closer; referenced by #confirmCancelBtn in JS | ✅ |
| button | `confirmOkBtn` | Confirm | referenced by #confirmOkBtn in JS | ✅ |
| button | `promptCancelBtn` | Cancel | cancel-btn dialog closer; referenced by #promptCancelBtn in JS; inside form #promptForm handled in JS | ✅ |
| button | `promptOkBtn` | OK | referenced by #promptOkBtn in JS; submit button for form #promptForm | ✅ |
| dialog | `supplierModal` | supplierModal | open count in HTML: 1; in JS: yes | ✅ |
| dialog | `purchaseModal` | purchaseModal | open count in HTML: 2; in JS: yes | ✅ |
| dialog | `supplierPaymentModal` | supplierPaymentModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `productModal` | productModal | open count in HTML: 1; in JS: yes | ✅ |
| dialog | `editProductModal` | editProductModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `stockModal` | stockModal | open count in HTML: 2; in JS: yes | ✅ |
| dialog | `hospitalityTableModal` | hospitalityTableModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `hospitalityTabModal` | hospitalityTabModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `hospitalityOrderModal` | hospitalityOrderModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `hospitalityPaymentModal` | hospitalityPaymentModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `hospitalityRecipeModal` | hospitalityRecipeModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `hospitalityWastageModal` | hospitalityWastageModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `saleModal` | saleModal | open count in HTML: 2; in JS: yes | ✅ |
| dialog | `expenseModal` | expenseModal | open count in HTML: 2; in JS: yes | ✅ |
| dialog | `creditModal` | creditModal | open count in HTML: 1; in JS: yes | ✅ |
| dialog | `customerModal` | customerModal | open count in HTML: 1; in JS: yes | ✅ |
| dialog | `staffInviteModal` | staffInviteModal | open count in HTML: 1; in JS: yes | ✅ |
| dialog | `openShiftModal` | openShiftModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `closeShiftModal` | closeShiftModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `importDataModal` | importDataModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `barcodeCameraModal` | barcodeCameraModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `receiptModal` | receiptModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `voidSaleModal` | voidSaleModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `stockAdjustModal` | stockAdjustModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `changePinModal` | changePinModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `editCustomerModal` | editCustomerModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `editSupplierModal` | editSupplierModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `adminPaymentModal` | adminPaymentModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `adminUserModal` | adminUserModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `notificationsModal` | notificationsModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `upgradeModal` | upgradeModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `creditRepaymentModal` | creditRepaymentModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `customerLedgerModal` | customerLedgerModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `pettyCashModal` | pettyCashModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `zReportModal` | zReportModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `parkedCartsModal` | parkedCartsModal | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `confirmDialog` | confirmDialog | open count in HTML: 0; in JS: yes | ✅ |
| dialog | `promptDialog` | promptDialog | open count in HTML: 0; in JS: yes | ✅ |
| form | `loginForm` | loginForm | handled in JS | ✅ |
| form | `signupForm` | signupForm | handled in JS | ✅ |
| form | `supportNoteForm` | supportNoteForm | handled in JS | ✅ |
| form | `supportTicketForm` | supportTicketForm | handled in JS | ✅ |
| form | `settingsForm` | settingsForm | handled in JS | ✅ |
| form | `supplierForm` | supplierForm | handled in JS | ✅ |
| form | `purchaseForm` | purchaseForm | handled in JS | ✅ |
| form | `supplierPaymentForm` | supplierPaymentForm | handled in JS | ✅ |
| form | `productForm` | productForm | handled in JS | ✅ |
| form | `editProductForm` | editProductForm | handled in JS | ✅ |
| form | `stockForm` | stockForm | handled in JS | ✅ |
| form | `hospitalityTableForm` | hospitalityTableForm | handled in JS | ✅ |
| form | `hospitalityTabForm` | hospitalityTabForm | handled in JS | ✅ |
| form | `hospitalityOrderForm` | hospitalityOrderForm | handled in JS | ✅ |
| form | `hospitalityPaymentForm` | hospitalityPaymentForm | handled in JS | ✅ |
| form | `hospitalityRecipeForm` | hospitalityRecipeForm | handled in JS | ✅ |
| form | `hospitalityWastageForm` | hospitalityWastageForm | handled in JS | ✅ |
| form | `saleForm` | saleForm | handled in JS | ✅ |
| form | `expenseForm` | expenseForm | handled in JS | ✅ |
| form | `creditForm` | creditForm | handled in JS | ✅ |
| form | `customerForm` | customerForm | handled in JS | ✅ |
| form | `staffInviteForm` | staffInviteForm | handled in JS | ✅ |
| form | `openShiftForm` | openShiftForm | handled in JS | ✅ |
| form | `closeShiftForm` | closeShiftForm | handled in JS | ✅ |
| form | `importDataForm` | importDataForm | handled in JS | ✅ |
| form | `voidSaleForm` | voidSaleForm | handled in JS | ✅ |
| form | `stockAdjustForm` | stockAdjustForm | handled in JS | ✅ |
| form | `changePinForm` | changePinForm | handled in JS | ✅ |
| form | `editCustomerForm` | editCustomerForm | handled in JS | ✅ |
| form | `editSupplierForm` | editSupplierForm | handled in JS | ✅ |
| form | `adminPaymentForm` | adminPaymentForm | handled in JS | ✅ |
| form | `adminUserForm` | adminUserForm | handled in JS | ✅ |
| form | `creditRepaymentForm` | creditRepaymentForm | handled in JS | ✅ |
| form | `pettyCashForm` | pettyCashForm | handled in JS | ✅ |
| form | `promptForm` | promptForm | handled in JS | ✅ |
