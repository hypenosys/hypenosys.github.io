        // Notification for awaiting approval
        sessions.forEach(s => {
            if (s.state === 'AWAITING_PLAN_APPROVAL' || s.state === 'AWAITING_USER_FEEDBACK') {
                const idSafe = s.name.split('/').pop();
                const lastNotif = localStorage.getItem(`jules_notif_approval_${idSafe}`);
                if (!lastNotif) {
                    showToast(`Sesión ${idSafe} espera tu revisión. <button onclick="openDrawer('${s.name}')" style="background:none; border:none; color:#fff; text-decoration:underline; cursor:pointer; padding:0; margin-left:10px;">ABRIR DRAWER</button>`, 'amber');
                    localStorage.setItem(`jules_notif_approval_${idSafe}`, Date.now());
                }
            }
        });
