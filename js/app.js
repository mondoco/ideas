import { db } from './firebase.js';
import { 
  getDoc, 
  setDoc, 
  getDocs, 
  doc, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  updateDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
// import {
//   collection, addDoc, query, where, orderBy, onSnapshot,
//   doc, updateDoc, serverTimestamp, getDoc, setDoc, getDocs
// } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import {
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

// ===================== Cloudinary Config =====================
const CLOUDINARY_CLOUD_NAME = 'dflfxz3ir'; // ⚠️ غيّره لاسمك
const CLOUDINARY_UPLOAD_PRESET = 'idea_preset';   // ⚠️ تأكد من الاسم


// ===================== Firebase Auth =====================
const auth = getAuth();
const provider = new GoogleAuthProvider();

let currentUser = null;

// ===================== عناصر DOM =====================
const ideasGrid = document.getElementById('ideasGrid');
const ideaModal = document.getElementById('ideaModal');
const ideaForm = document.getElementById('ideaForm');
const modalTitle = document.getElementById('modalTitle');
const imageUpload = document.getElementById('imageUpload');
const audioUpload = document.getElementById('audioUpload');
const imagePreview = document.getElementById('imagePreview');
const audioPreview = document.getElementById('audioPreview');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const searchInput = document.getElementById('searchInput');
const tagFilter = document.getElementById('tagFilter');
const openAddModalBtn = document.getElementById('openAddModal');

let allIdeas = [];
let editingId = null;
let existingImageUrls = []; // الصور القديمة الباقية بعد التعديل
let allUsers = []; // قائمة المستخدمين
let selectedUserIds = []; // المستخدمين المحددين حالياً

// ===================== أزرار تسجيل الدخول / الخروج =====================
const loginBtn = document.createElement('button');
loginBtn.className = 'add-idea-btn';
loginBtn.innerHTML = '<i class="fa-brands fa-google"></i> تسجيل الدخول';
loginBtn.onclick = () => signInWithPopup(auth, provider);

const logoutBtn = document.createElement('button');
logoutBtn.className = 'add-idea-btn';
logoutBtn.style.background = '#ff4444';
logoutBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> خروج';
logoutBtn.onclick = () => signOut(auth);

openAddModalBtn.onclick = () => openModal();

// ===================== دوال المستخدم =====================
async function checkUserProfile(user) {
    console.log('checkUserProfile called', user.uid);
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    try {
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
        const displayName = prompt('مرحبًا! من فضلك أدخل اسمك الظاهر في التطبيق:');
        await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: displayName?.trim() || user.displayName || 'مستخدم'
        });
        }
    } catch (error) {
        console.error('خطأ في إعداد ملف المستخدم:', error);
    }
}

function updateUIForAuth(user) {
  const header = document.querySelector('header');
  const oldAuthBtn = document.getElementById('authBtn');
  if (oldAuthBtn) oldAuthBtn.remove();

  if (user) {
    currentUser = user;
    header.appendChild(logoutBtn);
    openAddModalBtn.style.display = 'inline-flex';
    checkUserProfile(user).then(() => loadIdeas());
  } else {
    currentUser = null;
    header.appendChild(loginBtn);
    openAddModalBtn.style.display = 'none';
    ideasGrid.innerHTML = '<p style="text-align:center; color:white;">سجل الدخول بحساب جوجل عشان تشوف أفكارك</p>';
  }
}

onAuthStateChanged(auth, async (user) => {
  updateUIForAuth(user);
  if (user) {
    await checkUserProfile(user);   // ⬅️ هنا تُطلب الاسم أو تُنشئ المستند
    loadIdeas();                    // تحميل الأفكار بعد التأكد من وجود ملف المستخدم
  }
});

// ===================== Cloudinary رفع =====================
async function uploadToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', `users/${currentUser?.uid || 'anonymous'}`);

  const response = await fetch(url, { method: 'POST', body: formData });
  if (!response.ok) throw new Error('فشل الرفع');
  const data = await response.json();
  return data.secure_url;
}

// ===================== تحميل الأفكار =====================
// متغير عام للخريطة والمشتركين
let ideasMap = new Map();
let ideaUnsubscribes = [];

function unsubscribeAll() {
  ideaUnsubscribes.forEach(unsub => unsub());
  ideaUnsubscribes = [];
}

function loadIdeas() {
  if (!currentUser) return;

  // إلغاء أي اشتراكات سابقة
  unsubscribeAll();
  ideasMap.clear();

  // استعلام 1: أفكار المستخدم
  const userIdeasQuery = query(
    collection(db, 'ideas'),
    where('userId', '==', currentUser.uid),
    orderBy('createdAt', 'desc')
  );

  // استعلام 2: الأفكار العامة
  const publicIdeasQuery = query(
    collection(db, 'ideas'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc')
  );

  // استعلام 3: الأفكار المختارة التي تحتوي على المستخدم
  const selectedIdeasQuery = query(
    collection(db, 'ideas'),
    where('allowedUsers', 'array-contains', currentUser.uid),
    orderBy('createdAt', 'desc')
  );

  const processSnapshot = (snapshot) => {
    snapshot.forEach(doc => {
      if (!ideasMap.has(doc.id)) {
        ideasMap.set(doc.id, { id: doc.id, ...doc.data() });
      }
    });
    updateUIFromMap();
  };

  const errorHandler = (error) => {
    console.error('خطأ في تحميل الأفكار:', error);
    // إذا كان الخطأ بسبب الفهرس، سترى الرابط في الـ console
  };

  const unsub1 = onSnapshot(userIdeasQuery, processSnapshot, errorHandler);
  const unsub2 = onSnapshot(publicIdeasQuery, processSnapshot, errorHandler);
  const unsub3 = onSnapshot(selectedIdeasQuery, processSnapshot, errorHandler);

  ideaUnsubscribes = [unsub1, unsub2, unsub3];
}

function updateUIFromMap() {
  allIdeas = Array.from(ideasMap.values())
    .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

  ideasGrid.innerHTML = '';
  const tagsSet = new Set();

  allIdeas.forEach(idea => {
    idea.tags?.forEach(tag => tagsSet.add(tag));
    displayIdeaCard(idea);
  });

  populateTagFilter(Array.from(tagsSet));
  filterAndDisplay();
}
// ===================== دوال العرض والتصفية =====================
function populateTagFilter(tags) {
  tagFilter.innerHTML = '<option value="">كل التصنيفات</option>';
  tags.sort().forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    tagFilter.appendChild(option);
  });
}

function filterAndDisplay() {
  const searchTerm = searchInput.value.toLowerCase();
  const selectedTag = tagFilter.value;

  const filtered = allIdeas.filter(idea => {
    const matchSearch = idea.title.toLowerCase().includes(searchTerm) ||
                        idea.description.toLowerCase().includes(searchTerm);
    const matchTag = !selectedTag || (idea.tags && idea.tags.includes(selectedTag));
    return matchSearch && matchTag;
  });

  ideasGrid.innerHTML = '';
  filtered.forEach(idea => displayIdeaCard(idea));
}

searchInput.addEventListener('input', filterAndDisplay);
tagFilter.addEventListener('change', filterAndDisplay);

function displayIdeaCard(idea) {
  const card = document.createElement('div');
  card.className = 'idea-card';
  card.onclick = () => window.location.href = `pages/idea.html?id=${idea.id}`;

  const mainImage = idea.imageUrls?.length ? idea.imageUrls[0] : '';
  card.innerHTML = `
    ${mainImage ? `<img src="${mainImage}" alt="${idea.title}">` : ''}
    <div class="idea-card-content">
      <h3>${idea.title}</h3>
      <p>${idea.description}</p>
      <div class="tags">
        ${idea.tags?.map(tag => `<span class="tag">${tag}</span>`).join('') || ''}
      </div>
      ${idea.audioUrl ? '<div class="has-audio"><i class="fa-solid fa-music"></i> يوجد تسجيل صوتي</div>' : ''}
      <div class="visibility-badge">${idea.visibility === 'public' ? '🌐 عام' : idea.visibility === 'selected' ? '👥 مختارين' : '🔒 خاص'}</div>
    </div>
  `;
  ideasGrid.appendChild(card);
}

// ===================== إدارة المودال =====================
document.getElementById('closeModal').onclick = closeModal;
window.onclick = (e) => { if (e.target == ideaModal) closeModal(); };

// عرض/إخفاء قائمة المستخدمين
document.getElementById('ideaVisibility').addEventListener('change', async (e) => {
  const val = e.target.value;
  const group = document.getElementById('selectedUsersGroup');
  if (val === 'selected') {
    group.style.display = 'block';
    await loadAllUsers();
    renderUserCheckboxes(selectedUserIds);
  } else {
    group.style.display = 'none';
  }
});

async function loadAllUsers() {
  const usersSnap = await getDocs(collection(db, 'users'));
  allUsers = [];
  usersSnap.forEach(docSnap => allUsers.push({ uid: docSnap.id, ...docSnap.data() }));
}

function renderUserCheckboxes(initialSelected = []) {
  const container = document.getElementById('usersCheckboxList');
  container.innerHTML = '';
  allUsers.forEach(user => {
    const label = document.createElement('label');
    label.className = 'user-checkbox-item';
    const checked = initialSelected.includes(user.uid);
    label.innerHTML = `
      <input type="checkbox" value="${user.uid}" ${checked ? 'checked' : ''}>
      <span>${user.displayName || user.email}</span>
    `;
    container.appendChild(label);

    const checkbox = label.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        if (!selectedUserIds.includes(user.uid)) selectedUserIds.push(user.uid);
      } else {
        selectedUserIds = selectedUserIds.filter(id => id !== user.uid);
      }
    });
  });
}

async function openModal(idea = null) {
  ideaModal.style.display = 'block';
  imagePreview.innerHTML = '';
  audioPreview.style.display = 'none';
  uploadProgress.style.display = 'none';
  document.getElementById('selectedUsersGroup').style.display = 'none';

  if (idea) {
    editingId = idea.id;
    modalTitle.textContent = 'تعديل الفكرة';
    document.getElementById('ideaTitle').value = idea.title;
    document.getElementById('ideaDescription').value = idea.description;
    document.getElementById('ideaTags').value = idea.tags?.join('، ') || '';
    document.getElementById('ideaVisibility').value = idea.visibility || 'private';
    
    existingImageUrls = idea.imageUrls ? [...idea.imageUrls] : [];
    selectedUserIds = idea.allowedUsers ? [...idea.allowedUsers] : [];

    // عرض الصور الحالية مع إمكانية الحذف
    existingImageUrls.forEach((url, index) => {
      const container = document.createElement('div');
      container.style.position = 'relative';
      container.style.display = 'inline-block';
      const img = document.createElement('img');
      img.src = url;
      img.style.width = '90px';
      img.style.height = '90px';
      const delBtn = document.createElement('span');
      delBtn.innerHTML = '×';
      delBtn.className = 'delete-image-btn';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        container.remove();
        existingImageUrls = existingImageUrls.filter(u => u !== url);
      };
      container.appendChild(img);
      container.appendChild(delBtn);
      imagePreview.appendChild(container);
    });

    if (idea.audioUrl) {
      audioPreview.src = idea.audioUrl;
      audioPreview.style.display = 'block';
    }

    if (idea.visibility === 'selected') {
      document.getElementById('selectedUsersGroup').style.display = 'block';
      await loadAllUsers();
      renderUserCheckboxes(selectedUserIds);
    }
  } else {
    editingId = null;
    modalTitle.textContent = 'إضافة فكرة جديدة';
    ideaForm.reset();
    existingImageUrls = [];
    selectedUserIds = [];
  }
}

function closeModal() {
  ideaModal.style.display = 'none';
  ideaForm.reset();
  imagePreview.innerHTML = '';
  audioPreview.style.display = 'none';
  editingId = null;
}

// ===================== معاينة الملفات =====================
imageUpload.addEventListener('change', (e) => {
  // لا نمسح المعاينة السابقة، نضيف فقط الصور الجديدة
  Array.from(e.target.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const container = document.createElement('div');
      container.style.position = 'relative';
      container.style.display = 'inline-block';
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.style.width = '90px';
      img.style.height = '90px';
      // زر حذف للصورة الجديدة (قبل الرفع)
      const delBtn = document.createElement('span');
      delBtn.innerHTML = '×';
      delBtn.className = 'delete-image-btn';
      delBtn.onclick = (ev2) => {
        ev2.stopPropagation();
        container.remove();
        // إزالة الملف من input file غير ممكنة مباشرة، لكن سنتجاهلها عند الرفع
      };
      container.appendChild(img);
      container.appendChild(delBtn);
      imagePreview.appendChild(container);
    };
    reader.readAsDataURL(file);
  });
});

audioUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      audioPreview.src = ev.target.result;
      audioPreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }
});

// ===================== حفظ الفكرة =====================
ideaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) return alert('يجب تسجيل الدخول');

  const title = document.getElementById('ideaTitle').value.trim();
  const description = document.getElementById('ideaDescription').value.trim();
  const tagsString = document.getElementById('ideaTags').value.trim();
  const tags = tagsString ? tagsString.split(',').map(t => t.trim()).filter(t => t) : [];
  const visibility = document.getElementById('ideaVisibility').value;

  uploadProgress.style.display = 'block';

  try {
    let newImageUrls = [];
    let audioUrl = null;

    // رفع الصور الجديدة المختارة
    const imageFiles = Array.from(imageUpload.files);
    if (imageFiles.length > 0) {
      progressText.textContent = 'جاري رفع الصور...';
      for (const file of imageFiles) {
        const url = await uploadToCloudinary(file);
        newImageUrls.push(url);
      }
    }

    // رفع الصوت
    const audioFile = audioUpload.files[0];
    if (audioFile) {
      progressText.textContent = 'جاري رفع التسجيل الصوتي...';
      audioUrl = await uploadToCloudinary(audioFile);
    }

    let finalImageUrls = editingId ? [...existingImageUrls] : [];
    finalImageUrls = finalImageUrls.concat(newImageUrls);

    let allowedUsers = [];
    if (visibility === 'selected') {
      allowedUsers = [...selectedUserIds];
    }

    const ideaData = {
      title,
      description,
      tags,
      userId: currentUser.uid,
      visibility,
      allowedUsers,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      imageUrls: finalImageUrls,
      audioUrl: audioUrl || (editingId ? (document.getElementById('audioPreview').src || null) : null)
    };

    if (editingId) {
      await updateDoc(doc(db, 'ideas', editingId), ideaData);
    } else {
      await addDoc(collection(db, 'ideas'), ideaData);
    }

    closeModal();
    alert('تم الحفظ بنجاح! 🎉');
  } catch (error) {
    console.error(error);
    alert('حدث خطأ: ' + error.message);
  } finally {
    uploadProgress.style.display = 'none';
  }
});

// دعم التعديل من صفحة التفاصيل
const urlParams = new URLSearchParams(window.location.search);
const editId = urlParams.get('edit');
if (editId) {
  const checkIdeas = setInterval(() => {
    const idea = allIdeas.find(i => i.id === editId);
    if (idea) {
      openModal(idea);
      clearInterval(checkIdeas);
    }
  }, 100);
}