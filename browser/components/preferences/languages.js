# -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
# 
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
# 
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
# 
# The Original Code is the Firefox Preferences System.
# 
# The Initial Developer of the Original Code is Ben Goodger.
# Portions created by the Initial Developer are Copyright (C) 2005
# the Initial Developer. All Rights Reserved.
# 
# Contributor(s):
#   Ben Goodger <ben@mozilla.org>
#   Adrian Havill <havill@redhat.com>
#   Steffen Wilberg <steffen.wilberg@web.de>
# 
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
# 
# ***** END LICENSE BLOCK *****

var gLanguagesDialog = {

  _availableLanguagesList : [],
  _acceptLanguages        : { },
  
  _selectedItemID         : null,
  
  init: function ()
  {
    if (!this._availableLanguagesList.length)
      this._loadAvailableLanguages();
  },
  
  get _activeLanguages()
  {
    return document.getElementById("activeLanguages");
  },
  
  get _availableLanguages()
  {
    return document.getElementById("availableLanguages");
  },
  
  _loadAvailableLanguages: function ()
  {
    // This is a parser for: resource://gre/res/language.properties
    // The file is formatted like so:
    // ab[-cd].accept=true|false
    //  ab = language
    //  cd = region
    var bundleAccepted    = document.getElementById("bundleAccepted");
    var bundleRegions     = document.getElementById("bundleRegions");
    var bundleLanguages   = document.getElementById("bundleLanguages");
    var bundlePreferences = document.getElementById("bundlePreferences");

    function LanguageInfo(aName, aABCD, aIsVisible)
    {
      this.name = aName;
      this.abcd = aABCD;
      this.isVisible = aIsVisible;
    }

    // 1) Read the available languages out of language.properties
    var strings = bundleAccepted.strings;
    while (strings.hasMoreElements()) {
      var currString = strings.getNext();
      if (!(currString instanceof Components.interfaces.nsIPropertyElement))
        break;
      
      var property = currString.key.split("."); // ab[-cd].accept
      if (property[1] == "accept") {
        var abCD = property[0];
        var abCDPairs = abCD.split("-");      // ab[-cd]
        var useABCDFormat = abCDPairs.length > 1;
        var ab = useABCDFormat ? abCDPairs[0] : abCD;
        var cd = useABCDFormat ? abCDPairs[1] : "";
        if (ab) {
          var language = "";
          try {
            language = bundleLanguages.getString(ab);
          } 
          catch (e) { continue; };
          
          var region = "";
          if (useABCDFormat) {
            try {
              region = bundleRegions.getString(cd);
            }
            catch (e) { continue; }
          }
          
          var name = "";
          if (useABCDFormat)
            name = bundlePreferences.getFormattedString("languageRegionCodeFormat", 
                                                        [language, region, abCD]);
          else
            name = bundlePreferences.getFormattedString("languageCodeFormat", 
                                                        [language, abCD]);
          
          if (name && abCD) {
            var isVisible = currString.value == "true" && 
                            (!(abCD in this._acceptLanguages) || !this._acceptLanguages[abCD]);
            var li = new LanguageInfo(name, abCD, isVisible);
            this._availableLanguagesList.push(li);
          }
        }
      }
    }
    this._buildAvailableLanguageList();
  },
  
  _buildAvailableLanguageList: function ()
  {
    var availableLanguagesPopup = document.getElementById("availableLanguagesPopup");
    while (availableLanguagesPopup.hasChildNodes())
      availableLanguagesPopup.removeChild(availableLanguagesPopup.firstChild);
      
    // Sort the list of languages by name
    this._availableLanguagesList.sort(function (a, b) {
                                        if (a.name < b.name) return -1;
                                        if (a.name > b.name) return 1;
                                        return 0;
                                      });
                                  
    // Load the UI with the data
    for (var i = 0; i < this._availableLanguagesList.length; ++i) {
      var abCD = this._availableLanguagesList[i].abcd;
      if (this._availableLanguagesList[i].isVisible && 
          (!(abCD in this._acceptLanguages) || !this._acceptLanguages[abCD])) {
        var menuitem = document.createElement("menuitem");
        menuitem.id = this._availableLanguagesList[i].abcd;
        availableLanguagesPopup.appendChild(menuitem);
        menuitem.setAttribute("label", this._availableLanguagesList[i].name);
      }
    }
  },
  
  readAcceptLanguages: function ()
  {
    while (this._activeLanguages.hasChildNodes())
      this._activeLanguages.removeChild(this._activeLanguages.firstChild);
    
    var selectedIndex = 0;
    var preference = document.getElementById("intl.accept_languages");
    if (preference.value == "") 
      return undefined;
    var languages = preference.value.split(/\s*,\s*/);
    for (var i = 0; i < languages.length; ++i) {
      var name = this._getLanguageName(languages[i]);
      if (!name)
        name = "[" + languages[i] + "]";
      var listitem = document.createElement("listitem");
      listitem.id = languages[i];
      if (languages[i] == this._selectedItemID)
        selectedIndex = i;
      this._activeLanguages.appendChild(listitem);
      listitem.setAttribute("label", name);

      // Hash this language as an "Active" language so we don't
      // show it in the list that can be added. 
      this._acceptLanguages[languages[i]] = true;
    }

    if (this._activeLanguages.childNodes.length > 0) 
      this._activeLanguages.selectedIndex = selectedIndex;
    
    return undefined;
  },
  
  writeAcceptLanguages: function ()
  {
    return undefined;
  },
  
  onAvailableLanguageSelect: function ()
  {
    var addButton = document.getElementById("addButton");
    addButton.disabled = false;
    
    this._availableLanguages.removeAttribute("accesskey");
  },
  
  addLanguage: function ()
  {
    var selectedID = this._availableLanguages.selectedItem.id;
    var preference = document.getElementById("intl.accept_languages");
    var arrayOfPrefs = preference.value.split(/\s*,\s*/);
    for (var i = 0; i < arrayOfPrefs.length; ++i ){
      if (arrayOfPrefs[i] == selectedID)
        return;
    }
      
    this._selectedItemID = selectedID;
    
    if (preference.value == "") 
      preference.value = selectedID;
    else
      preference.value += "," + selectedID;
  
    this._acceptLanguages[selectedID] = true;
    this._availableLanguages.selectedItem = null;
    
    // Reuild the available list with the added item removed...
    this._buildAvailableLanguageList(); 
    
    this._availableLanguages.setAttribute("label", this._availableLanguages.getAttribute("label2"));
    this._availableLanguages.setAttribute("accesskey", this._availableLanguages.getAttribute("accesskey2"));
  },
  
  removeLanguage: function ()
  {
    // Build the new preference value string.
    var languagesArray = [];
    for (var i = 0; i < this._activeLanguages.childNodes.length; ++i) {
      var item = this._activeLanguages.childNodes[i];
      if (!item.selected) 
        languagesArray.push(item.id);
      else  
        this._acceptLanguages[item.id] = false;
    }
    var string = languagesArray.join(",");

    // Get the item to select after the remove operation completes.     
    var selection = this._activeLanguages.selectedItems;
    var lastSelected = selection[selection.length-1];
    var selectItem = lastSelected.nextSibling || lastSelected.previousSibling;
    selectItem = selectItem ? selectItem.id : null;
    
    this._selectedItemID = selectItem;

    // Update the preference and force a UI rebuild
    var preference = document.getElementById("intl.accept_languages");
    preference.value = string;

    this._buildAvailableLanguageList(); 
  },
  
  _getLanguageName: function (aABCD)
  {
    if (!this._availableLanguagesList.length)
      this._loadAvailableLanguages();
    for (var i = 0; i < this._availableLanguagesList.length; ++i) {
      if (aABCD == this._availableLanguagesList[i].abcd) 
        return this._availableLanguagesList[i].name;
    }
    return "";
  },
  
  moveUp: function ()
  {
    var selectedItem = this._activeLanguages.selectedItems[0];
    var previousItem = selectedItem.previousSibling;
    
    var string = "";
    for (var i = 0; i < this._activeLanguages.childNodes.length; ++i) {
      var item = this._activeLanguages.childNodes[i];
      string += (i == 0 ? "" : ",");
      if (item.id == previousItem.id) 
        string += selectedItem.id;
      else if (item.id == selectedItem.id)
        string += previousItem.id;
      else
        string += item.id;
    }
    
    this._selectedItemID = selectedItem.id;

    // Update the preference and force a UI rebuild
    var preference = document.getElementById("intl.accept_languages");
    preference.value = string;
  },
  
  moveDown: function ()
  {
    var selectedItem = this._activeLanguages.selectedItems[0];
    var nextItem = selectedItem.nextSibling;
    
    var string = "";
    for (var i = 0; i < this._activeLanguages.childNodes.length; ++i) {
      var item = this._activeLanguages.childNodes[i];
      string += (i == 0 ? "" : ",");
      if (item.id == nextItem.id) 
        string += selectedItem.id;
      else if (item.id == selectedItem.id)
        string += nextItem.id;
      else
        string += item.id;
    }
    
    this._selectedItemID = selectedItem.id;

    // Update the preference and force a UI rebuild
    var preference = document.getElementById("intl.accept_languages");
    preference.value = string;
  },
  
  onLanguageSelect: function ()
  {
    var upButton = document.getElementById("up");
    var downButton = document.getElementById("down");
    var removeButton = document.getElementById("remove");
    switch (this._activeLanguages.selectedCount) {
    case 0:
      upButton.disabled = downButton.disabled = removeButton.disabled = true;
      break;
    case 1:
      upButton.disabled = this._activeLanguages.selectedIndex == 0;
      downButton.disabled = this._activeLanguages.selectedIndex == this._activeLanguages.childNodes.length - 1;
      removeButton.disabled = false;
      break;
    default:
      upButton.disabled = true;
      downButton.disabled = true;
      removeButton.disabled = false;
    }
  }
};

